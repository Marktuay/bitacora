"""Live deployment check; inserts only tagged disposable records and removes them.

Requires SUPABASE_SECRET_KEY and an access document containing two PIN lines.
No keys, PINs, employee names or signed URLs are written to the result.
"""
import base64
import io
import json
import os
from pathlib import Path
import re
import sys
import uuid
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import urlencode
from zipfile import ZipFile
import xml.etree.ElementTree as ET
from PIL import Image, ImageDraw

ROOT = Path('/workspace/scratch/f6a120d82e61')
OUT = ROOT / 'verification'
OUT.mkdir(exist_ok=True)
APP = 'https://bitacora-km.vercel.app'
SB = 'https://ztkvymdcnpoiiqkuwgoj.supabase.co'
KEY = os.environ['SUPABASE_SECRET_KEY']
pins = re.findall(r'^PIN:\s*(\S+)', (ROOT / 'private/Bitacora_KM_Accesos.txt').read_text(), re.M)
assert len(pins) == 2
AUDIT, REPORT = {'x-audit-pin': pins[0]}, {'x-report-pin': pins[1]}
MARKER = 'PRUEBA-TECNICA-' + uuid.uuid4().hex[:12]
DATE = '2026-09-21'
state = {'marker': MARKER, 'items': [], 'photos': [], 'checks': [], 'cleanup': []}

def checkpoint():
    (OUT / 'live-results.json').write_text(json.dumps(state, ensure_ascii=False, indent=2))

def request(path, method='GET', payload=None, headers=None, base=APP):
    headers = dict(headers or {})
    data = None
    if payload is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(payload).encode()
    req = Request(base + path, data=data, method=method, headers=headers)
    try:
        with urlopen(req, timeout=45) as response:
            return response.status, response.headers, response.read()
    except HTTPError as error:
        return error.code, error.headers, error.read()

def json_request(path, method='GET', payload=None, headers=None, expected=200):
    code, _, data = request(path, method, payload, headers)
    assert code == expected, f'{method} {path.split("?")[0]}: expected {expected}, received {code}: {data[:180].decode(errors="replace")}'
    return json.loads(data)

def record(company, check):
    state['checks'].append({'company': company, 'check': check, 'passed': True})
    checkpoint()
    print(company + ': ' + check, flush=True)

def photo(km):
    image = Image.new('RGB', (640, 360), '#edf2f7')
    draw = ImageDraw.Draw(image)
    draw.text((35, 100), 'PRUEBA TECNICA - NO ES UN RECORRIDO REAL', fill='#172554')
    draw.text((35, 170), f'ODOMETRO DE PRUEBA: {km} KM', fill='#172554')
    out = io.BytesIO()
    image.save(out, format='PNG')
    path = OUT / f'odometro-prueba-{km}.png'
    path.write_bytes(out.getvalue())
    return base64.b64encode(out.getvalue()).decode()

photos = [photo(100), photo(125)]
try:
    for company in ['blokon', 'conaser', 'security']:
        catalog = json_request('/api/catalog?' + urlencode({'company': company}))
        assert catalog['employees'] and catalog['vehicles'] and catalog['demo'] is False
        vehicle = next(v for v in catalog['vehicles'] if not v['employee_id'] or any(e['id'] == v['employee_id'] for e in catalog['employees']))
        employee = next(e for e in catalog['employees'] if not vehicle['employee_id'] or e['id'] == vehicle['employee_id'])
        record(company, 'catálogo real disponible')
        body = dict(date=DATE, employeeId=employee['id'], vehicleId=vehicle['id'], areaRequest='AUDITORIA', origin=MARKER, destination='PRUEBA TECNICA TEMPORAL', timeStart='00:00', timeEnd='00:01', kmInitial=100, kmFinal=125, managementType=MARKER, orderReference=MARKER, observation='Registro temporal de verificación; será eliminado.')
        endpoint = '/api/entries?' + urlencode({'company': company})
        json_request(endpoint, 'POST', body, expected=400)
        for kind, encoded in zip(['odometer-start', 'odometer-end'], photos):
            uploaded = json_request('/api/support', 'POST', {'company': company, 'kind': kind, 'base64': encoded, 'contentType': 'image/png'}, expected=201)
            state['photos'].append(uploaded['path'])
            checkpoint()
            body['odometerStartPath' if kind == 'odometer-start' else 'odometerEndPath'] = uploaded['path']
            if kind == 'odometer-start':
                json_request(endpoint, 'POST', body, expected=400)
        missing_initial = {k: v for k, v in body.items() if k != 'odometerStartPath'}
        json_request(endpoint, 'POST', missing_initial, expected=400)
        forged = {**body, 'odometerEndPath': company + '/odometer-end/no-existe.png'}
        json_request(endpoint, 'POST', forged, expected=400)
        record(company, 'ambas fotografías obligatorias y evidencia inexistente rechazada')
        saved = json_request(endpoint, 'POST', body, expected=201)['item']
        state['items'].append({'company': company, 'id': saved['id']})
        checkpoint()
        assert float(saved['km_travel']) == 25
        record(company, 'guardado real de 25 km con dos fotografías')
        latest = json_request('/api/latest?' + urlencode({'company': company, 'employeeId': employee['id'], 'vehicleId': vehicle['id']}))
        assert float(latest['item']['km_final']) == 125
        json_request(endpoint, headers={}, expected=401)
        audited = json_request(endpoint, headers=AUDIT)['items']
        assert any(row['id'] == saved['id'] for row in audited)
        reviewed = json_request(endpoint, 'PATCH', {'id': saved['id'], 'reviewStatus': 'Revisar', 'kmTraccar': 21}, AUDIT)['item']
        assert reviewed['review_status'] == 'Revisar' and float(reviewed['difference_km']) == -4
        record(company, 'PIN de auditoría, consulta, revisión y diferencia de kilómetros')
        evidence_query = '/api/support?' + urlencode({'path': body['odometerStartPath']})
        json_request(evidence_query, expected=401)
        signed = json_request(evidence_query, headers=AUDIT)['url']
        with urlopen(signed, timeout=40) as response:
            assert response.status == 200 and response.read(8) == b'\x89PNG\r\n\x1a\n'
        record(company, 'fotografía privada recuperada mediante enlace temporal')
        query = urlencode({'company': company, 'employeeId': employee['id'], 'from': DATE, 'to': DATE})
        json_request('/api/report?' + query, expected=401)
        report = json_request('/api/report?' + query, headers=REPORT)
        assert any(row['id'] == saved['id'] for row in report['items'])
        for extension in ['xlsx', 'pdf']:
            code, headers, content = request('/api/report-' + extension + '?' + query, headers=REPORT)
            assert code == 200 and 'attachment' in headers.get('Content-Disposition', '')
            (OUT / f'{company}.{extension}').write_bytes(content)
            if extension == 'pdf':
                assert content.startswith(b'%PDF-') and len(content) > 1000
            else:
                with ZipFile(io.BytesIO(content)) as archive:
                    sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
                    ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
                    cell = sheet.find('.//s:c[@r="I8"]/s:v', ns)
                    total = sheet.find('.//s:c[@r="I9"]/s:v', ns)
                    assert cell is not None and float(cell.text) == 25
                    assert total is not None and float(total.text) == 25
            record(company, 'reporte ' + extension.upper() + ' descargado y verificado')
    state['passed'] = True
except Exception as error:
    state['passed'] = False
    state['error'] = str(error)
    raise
finally:
    headers = {'apikey': KEY, 'Prefer': 'return=representation'}
    for item in state['items']:
        query = urlencode({'id': 'eq.' + item['id'], 'management_type': 'eq.' + MARKER})
        code, _, response = request('/rest/v1/bitacora_' + item['company'] + '?' + query, method='DELETE', headers=headers, base=SB)
        state['cleanup'].append({'kind': 'record', 'company': item['company'], 'ok': code in (200, 204)})
    if state['photos']:
        code, _, response = request('/storage/v1/object/bitacora-soportes', method='DELETE', payload={'prefixes': state['photos']}, headers={'apikey': KEY}, base=SB)
        state['cleanup'].append({'kind': 'photos', 'count': len(state['photos']), 'ok': code in (200, 204)})
    checkpoint()
    print(json.dumps({'passed': state.get('passed', False), 'checks': len(state['checks']), 'cleanup': state['cleanup']}, ensure_ascii=False), flush=True)
    if not all(check['ok'] for check in state['cleanup']):
        raise RuntimeError('Limpieza incompleta: consultar live-results.json')
