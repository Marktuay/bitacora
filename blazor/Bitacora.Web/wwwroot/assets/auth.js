window.KMAuth={
  async require(admin=false){
    if(/(?:access_token|error_code|type=recovery)=?/.test(location.hash)){location.replace('/recuperar.html'+location.hash);throw Error('Abriendo recuperación');}
    const r=await fetch('/api/session',{cache:'no-store'});
    if(r.status===401){location.replace('/login.html?next='+encodeURIComponent(location.pathname+location.search));throw Error('Iniciá sesión');}
    const data=await r.json();if(!r.ok)throw Error(data.error||'No se pudo verificar la sesión');
    if(data.passwordChangeRequired&&!/^\/cuenta(?:\.html)?$/.test(location.pathname)){location.replace('/cuenta.html?next='+encodeURIComponent(location.pathname+location.search));throw Error('Establecé tu propia contraseña');}
    if(admin===true&&!data.admin){location.replace('/reportes');throw Error('Acceso de administrador requerido');}
    if(admin==='manage'&&!data.admin&&!(data.managedCompanies||[]).length){location.replace('/reportes');throw Error('Permiso de jefe requerido');}
    const companyControl=document.getElementById('company');if(admin==='manage'&&!data.admin&&companyControl){for(const option of [...companyControl.options])if(!(data.managedCompanies||[]).includes(option.value))option.remove();}
    const nav=document.querySelector('.nav[data-auth-nav]');
    if(nav){
      const manager=data.admin||(data.managedCompanies||[]).length>0;
      const normalize=path=>path.replace(/\.html$/,'').replace(/\/$/,'')||'/';
      const current=normalize(location.pathname);
      const entries=[['homeLink','Inicio','/',true],['reportLink',manager?'Bitácoras':'Mi bitácora','/reportes',manager||(data.profiles||[]).length>0],['reviewLink','Revisar recorridos','/auditoria',manager],['teamLink','Colaboradores','/colaboradores.html',manager],['accessLink','Accesos','/accesos.html',manager],['managerLink','Permisos de jefes','/jefes.html',data.admin]];
      const controls=new Map();
      for(const [id,label,url,show] of entries){
        if(!show)continue;
        const link=document.createElement('a');link.id=id;link.className='btn ghost';link.href=url;link.textContent=label;
        if(normalize(url)===current||(url==='/'&&current==='/index'))link.setAttribute('aria-current','page');
        controls.set(id,link);
      }
      // No descartar acciones de las pantallas existentes, como Imprimir y CSV.
      const extraControls=[...nav.querySelectorAll('button')].filter(el=>el.id!=='logoutBtn');
      const sessionUser=document.getElementById('sessionUser')||document.createElement('span');
      sessionUser.id='sessionUser';sessionUser.className='connection sidebar-user';sessionUser.textContent=data.email||'Sesión activa';
      const logout=document.getElementById('logoutBtn')||document.createElement('button');
      logout.type='button';logout.id='logoutBtn';logout.className='btn ghost';logout.textContent='Cerrar sesión';
      logout.onclick=async()=>{await fetch('/api/session?action=logout',{method:'POST'});location.replace('/login.html');};
      const account=document.getElementById('changePasswordBtn')||document.createElement('a');
      account.id='changePasswordBtn';account.className='btn ghost';account.href='/cuenta.html';account.textContent='Mi cuenta';
      if(current==='/cuenta')account.setAttribute('aria-current','page');
      const connection=document.getElementById('connection');
      const brand=document.createElement('a');brand.className='sidebar-brand';brand.href='/';
      const mark=document.createElement('img');mark.className='sidebar-company-logo';mark.src='/assets/new-century.png';mark.alt='New Century';
      const brandText=document.createElement('span');brandText.textContent='Bitácora KM';
      brand.append(mark,brandText);
      const sections=[brand];
      const home=controls.get('homeLink');if(home){home.classList.add('sidebar-home-link');sections.push(home);}
      const modules=[
        ['Operación',['reportLink']],
        ['Revisión y control',['reviewLink','teamLink']],
        ['Administración',['accessLink','managerLink']]
      ];
      const addModule=(title,links,open=false)=>{
        if(!links.length)return;
        const module=document.createElement('details');module.className='nav-module';
        const heading=document.createElement('summary');heading.className='nav-module-title';heading.textContent=title;
        const actions=document.createElement('div');actions.className='nav-module-actions';
        links.forEach(link=>actions.appendChild(link));
        module.append(heading,actions);
        module.open=open||links.some(link=>link.hasAttribute('aria-current'));
        sections.push(module);
      };
      for(const [title,ids] of modules)addModule(title,ids.map(id=>controls.get(id)).filter(Boolean));
      addModule('Herramientas',extraControls,true);
      const accountItems=['sessionUser','changePasswordBtn','logoutBtn','connection'];
      const footer=document.createElement('section');footer.className='sidebar-footer';footer.setAttribute('aria-label','Cuenta y sesión');
      const footerTitle=document.createElement('h2');footerTitle.className='sidebar-footer-title';footerTitle.textContent='Cuenta y sesión';
      footer.appendChild(footerTitle);
      for(const id of accountItems){
        const item=id==='sessionUser'?sessionUser:id==='changePasswordBtn'?account:id==='logoutBtn'?logout:connection;
        if(item)footer.appendChild(item);
      }
      sections.push(footer);
      nav.id='kmSidebar';nav.classList.add('km-sidebar','nav-modules');
      nav.setAttribute('aria-label','Navegación principal de Bitácora KM');
      nav.replaceChildren(...sections);nav.dataset.authReady='true';
      document.body.classList.add('km-has-sidebar');document.body.prepend(nav);
      const topbar=document.querySelector('.topbar');
      if(topbar){
        const headerMark=topbar.querySelector('.brand .mark');
        if(headerMark){
          const logo=document.createElement('img');
          logo.className='km-company-logo';
          logo.src='/assets/new-century.png';
          logo.alt='New Century';
          headerMark.replaceChildren(logo);
          headerMark.setAttribute('aria-label','New Century');
        }
        const toggle=document.createElement('button');toggle.type='button';toggle.className='km-menu-toggle';toggle.textContent='☰  Menú';
        toggle.setAttribute('aria-label','Abrir menú de navegación');toggle.setAttribute('aria-controls','kmSidebar');
        topbar.appendChild(toggle);
        const backdrop=document.createElement('div');backdrop.className='km-sidebar-backdrop';backdrop.setAttribute('aria-hidden','true');
        document.body.appendChild(backdrop);
        const mobile=window.matchMedia('(max-width:850px)');
        const menu=open=>{
          const expanded=!!open&&mobile.matches;
          document.body.classList.toggle('km-menu-open',expanded);
          toggle.setAttribute('aria-expanded',String(expanded));
          toggle.setAttribute('aria-label',expanded?'Cerrar menú de navegación':'Abrir menú de navegación');
          nav.inert=mobile.matches&&!expanded;
        };
        toggle.addEventListener('click',()=>menu(!document.body.classList.contains('km-menu-open')));
        backdrop.addEventListener('click',()=>{menu(false);toggle.focus();});
        document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('km-menu-open')){menu(false);toggle.focus();}});
        window.addEventListener('resize',()=>menu(document.body.classList.contains('km-menu-open')));
        nav.addEventListener('click',e=>{if(e.target.closest('a[href]')&&mobile.matches)menu(false);});
        menu(false);
      }
      for(const card of document.querySelectorAll('.company-card')){
        const company=card.querySelector('a')?.getAttribute('href')?.replace(/^\//,'');
        card.hidden=!data.admin&&!(data.managedCompanies||[]).includes(company)&&!(data.profiles||[]).some(profile=>profile.company===company);
      }
    }
    return data;
  }
};
