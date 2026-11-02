-- Additive deployment prerequisite for web 1.4.6. Existing records remain unchanged.
-- NULL: older client/history; FALSE: Android still has GPS to send; TRUE: queue confirmed.
alter table public.km_mobile_trips add column if not exists gps_flushed boolean;
comment on column public.km_mobile_trips.gps_flushed is
 'Android GPS queue acknowledgement; null for legacy trips, false while pending, true after delivery.';
