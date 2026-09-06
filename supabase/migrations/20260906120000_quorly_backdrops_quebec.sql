-- Seven more landmarks, weighted to Québec, and the cycle re-spaced.
--
-- All CC0 or public domain, so no attribution line is needed anywhere in the app.
-- Each was checked by eye before being added: Commons search returned a flower
-- arrangement for "Sainte-Anne-de-Beaupré basilica", a private house for "Old
-- Quebec", and Niépce's 1826 "View from the Window at Le Gras" for "Mont-Tremblant".
-- Titles are not evidence.
insert into public.quorly_login_backdrops (url, label_en, label_fr, sort, glass) values
  ('/login/qc-parlement.jpg',   'Hôtel du Parlement, Québec',     'Hôtel du Parlement, Québec',        20, false),
  ('/login/qc-perce.jpg',       'Percé Rock, Gaspésie',           'Rocher Percé, Gaspésie',            50, true),
  ('/login/qc-notredame.jpg',   'Notre-Dame Basilica, Montréal',  'Basilique Notre-Dame, Montréal',    60, false),
  ('/login/qc-levis.jpg',       'Québec City from Lévis',         'Québec vu de Lévis',                80, false),
  ('/login/qc-saguenay.jpg',    'Saguenay Fjord, Québec',         'Fjord du Saguenay, Québec',         90, true),
  ('/login/qc-montmorency.jpg', 'Montmorency Falls, Québec',      'Chute Montmorency, Québec',        100, false),
  ('/login/qc-gatineau.jpg',    'Pink Lake, Gatineau Park',       'Lac Pink, parc de la Gatineau',    110, true)
on conflict do nothing;

-- Re-space the originals so glass and opaque alternate and no two frames from the
-- same region sit next to each other in the loop.
update public.quorly_login_backdrops set sort = 30  where url = '/login/frontenac.jpg';
update public.quorly_login_backdrops set sort = 40  where url = '/login/moraine.jpg';
update public.quorly_login_backdrops set sort = 70  where url = '/login/peggys.jpg';
update public.quorly_login_backdrops set sort = 120 where url = '/login/montreal.jpg';
