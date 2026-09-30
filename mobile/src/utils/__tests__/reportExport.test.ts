import { makeReport } from '../../testing/adminFixtures';
import { csvCell, reportCsv, reportFileName, reportHtml } from '../reportExport';

const WEEK_NOTE = 'La primera y la última semana solo cuentan los días dentro del periodo.';

it.each<[string | number | null, string]>([
  [5, '5'],
  [null, ''],
  ['Ana', 'Ana'],
  ['a;b', '"a;b"'],
  ['dice "hola"', '"dice ""hola"""'],
  ['=1+1', "'=1+1"],
  ['+51 999', "'+51 999"],
  ['-2', "'-2"],
  ['@x', "'@x"],
  // OWASP: TAB y CR al principio también pueden abrir una fórmula (F6). El CR además obliga a entrecomillar.
  ['\t=1+1', "'\t=1+1"],
  ['\r=1+1', `"'\r=1+1"`],
])('csvCell(%j) → %j', (value, expected) => {
  expect(csvCell(value)).toBe(expected);
});

it('reportCsv: BOM, «;», \\r\\n y los números del servidor, sección por sección', () => {
  const csv = reportCsv(makeReport());
  expect(csv.charCodeAt(0)).toBe(0xfeff); // BOM UTF-8: Excel lee bien las tildes
  expect(csv.startsWith('\uFEFFInforme de HueckoApp\r\n')).toBe(true);
  const lines = csv.slice(1).split('\r\n');
  expect(lines).toContain('Desde;2026-08-31;Hasta;2026-09-29');
  expect(lines).toContain('Usuarios nuevos;3');
  expect(lines).toContain(`Planes con fecha en el periodo;${makeReport().summary.confirmedPlans}`);
  expect(lines).toContain('Éxito de la IA (%);75');
  expect(lines).toContain('Evolución por día');
  expect(lines).toContain('Día;Registros;Grupos creados;Propuestas creadas;Llamadas a la IA');
  expect(lines).toContain('2026-09-28;2;1;1;3');
  expect(lines).toContain('En votación;1');
  expect(lines).toContain('Leer horario de una foto;3;2;67;2100');
  expect(lines).toContain('Ideas de plan;0;0;;');
  expect(lines).toContain('11:00;2');
  expect(lines).toContain('Proyecto Integrador;2');
});

it('por semanas: la columna dice «Semana del» y una nota avisa de las semanas partidas (CSV y PDF)', () => {
  const weekly = makeReport({ bucket: 'week' });
  const lines = reportCsv(weekly).slice(1).split('\r\n');
  expect(lines).toContain('Evolución por semana');
  expect(lines).toContain('Semana del;Registros;Grupos creados;Propuestas creadas;Llamadas a la IA');
  expect(lines).toContain(WEEK_NOTE);
  const html = reportHtml(weekly);
  expect(html).toContain('<th>Semana del</th>');
  expect(html).toContain(WEEK_NOTE);
  // Control positivo: por días no hay nota.
  expect(reportCsv(makeReport())).not.toContain(WEEK_NOTE);
  expect(reportHtml(makeReport())).not.toContain(WEEK_NOTE);
});

it('reportCsv neutraliza fórmulas en lo que escriben los usuarios (nombres de grupo)', () => {
  const csv = reportCsv(makeReport({ topGroups: [{ id: 'g', name: '=HYPERLINK("http://x")', proposals: 1 }] }));
  expect(csv.split('\r\n')).toContain('"\'=HYPERLINK(""http://x"")";1');
});

it('reportHtml: UTF-8, periodo legible y lo escrito por usuarios escapado', () => {
  const html = reportHtml(makeReport({ topGroups: [{ id: 'g', name: '<script>alert(1)</script>', proposals: 1 }] }));
  expect(html).toContain('<meta charset="utf-8" />');
  expect(html).toContain('Del 31/08/2026 al 29/09/2026');
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).toContain('Evolución por día');
  expect(html).toContain('Planes con fecha en el periodo');
  expect(html).not.toContain('Planes confirmados<');
  expect(html).toContain('Leer horario de una foto');
});

it('reportFileName usa los días del periodo', () => {
  expect(reportFileName(makeReport(), 'csv')).toBe('informe-hueckoapp_2026-08-31_2026-09-29.csv');
});
