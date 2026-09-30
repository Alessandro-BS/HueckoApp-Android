import type { AdminReport } from '@hueckoapp/shared';

import { AI_TASK_LABEL, PROPOSAL_STATE_ORDER, percentLabel } from './admin';
import { formatDateTime } from './days';
import { STATE_BADGE } from './proposals';

type Cell = string | number | null;

const pad2 = (n: number) => String(n).padStart(2, '0');
const hourLabel = (hour: number) => `${pad2(hour)}:00`;
// «2026-08-31» → «31/08/2026».
const dmy = (key: string) => key.split('-').reverse().join('/');

export const reportFileName = (report: AdminReport, ext: 'csv' | 'pdf') =>
  `informe-hueckoapp_${report.period.fromDate}_${report.period.toDate}.${ext}`;

// ---- CSV (D13) ----

// Lo que una hoja de cálculo tomaría por fórmula (lista de OWASP: = + - @, TAB y CR).
const FORMULA_START = /^[=+\-@\t\r]/;

/** Una celda: apóstrofo delante de lo que Excel tomaría por fórmula y comillas si lleva «;», comillas o saltos de línea. */
export function csvCell(value: Cell): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const csvRow = (cells: readonly Cell[]) => cells.map(csvCell).join(';');

/** CSV para Excel en español: «;» como separador, BOM UTF-8 (tildes) y \r\n. Una sección por bloque del informe. */
export function reportCsv(report: AdminReport): string {
  const { period, summary } = report;
  const rows: Cell[][] = [
    ['Informe de HueckoApp'],
    ['Desde', period.fromDate, 'Hasta', period.toDate],
    ['Generado (UTC)', report.generatedAt],
    [],
    ['Resumen'],
    ['Indicador', 'Valor'],
    ['Usuarios nuevos', summary.newUsers],
    ['Grupos nuevos', summary.newGroups],
    ['Propuestas nuevas', summary.newProposals],
    ['Planes confirmados', summary.confirmedPlans],
    ['Incidencias', summary.incidences],
    ['Llamadas a la IA', summary.aiCalls],
    ['Éxito de la IA (%)', report.ai.successRate],
    [],
    [report.bucket === 'day' ? 'Evolución por día' : 'Evolución por semana'],
    ['Inicio', 'Registros', 'Grupos creados', 'Propuestas creadas', 'Llamadas a la IA'],
    ...report.timeseries.map((p) => [p.start, p.registrations, p.groupsCreated, p.proposalsCreated, p.aiCalls]),
    [],
    ['Propuestas del periodo por estado'],
    ['Estado', 'Cantidad'],
    ...PROPOSAL_STATE_ORDER.map((s) => [STATE_BADGE[s].text, report.proposalsByState[s]]),
    [],
    ['Uso de la IA por función'],
    ['Función', 'Llamadas', 'Correctas', 'Éxito (%)', 'Duración media (ms)'],
    ...report.ai.byTask.map((t) => [AI_TASK_LABEL[t.task], t.calls, t.ok, t.successRate, t.avgDurationMs]),
    [],
    ['Hora de inicio de los planes confirmados'],
    ['Hora', 'Planes'],
    ...report.popularHours.map((h) => [hourLabel(h.hour), h.count]),
    [],
    ['Grupos con más propuestas'],
    ['Grupo', 'Propuestas'],
    ...report.topGroups.map((g) => [g.name, g.proposals]),
  ];
  return `﻿${rows.map(csvRow).join('\r\n')}\r\n`;
}

// ---- HTML → PDF con expo-print (D13) ----

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);

const htmlTable = (headers: readonly string[], rows: readonly Cell[][]) =>
  `<table><thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c === null ? '—' : escapeHtml(String(c))}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;

// Barras horizontales con CSS (sin imágenes ni SVG): se imprimen igual en Android e iOS.
function htmlBars(rows: readonly { label: string; value: number }[]): string {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<table class="bars"><tbody>${rows
    .map(
      (r) =>
        `<tr><td class="label">${escapeHtml(r.label)}</td><td class="bar"><div style="width:${Math.round((r.value * 100) / max)}%"></div></td><td class="num">${r.value}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

export function reportHtml(report: AdminReport): string {
  const { period, summary } = report;
  const tiles: [string, string | number][] = [
    ['Usuarios nuevos', summary.newUsers],
    ['Grupos nuevos', summary.newGroups],
    ['Propuestas nuevas', summary.newProposals],
    ['Planes confirmados', summary.confirmedPlans],
    ['Incidencias', summary.incidences],
    ['Llamadas a la IA', `${summary.aiCalls} (éxito ${percentLabel(report.ai.successRate)})`],
  ];
  const activeHours = report.popularHours.filter((h) => h.count > 0);
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Informe de HueckoApp</title>
<style>
  body { font-family: -apple-system, Roboto, 'Segoe UI', sans-serif; color: #1D1B20; margin: 24px; font-size: 12px; }
  h1 { color: #6750A4; font-size: 22px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 20px 0 8px; border-bottom: 1px solid #CAC4D0; padding-bottom: 4px; }
  .muted { color: #49454F; }
  .tiles { display: flex; flex-wrap: wrap; gap: 8px; }
  .tile { flex: 1 0 28%; background: #F3EDF7; border-radius: 8px; padding: 8px; }
  .tile b { display: block; font-size: 18px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #ECE6F0; }
  .bars td.label { width: 30%; } .bars td.num { width: 10%; text-align: right; }
  .bars td.bar div { height: 10px; background: #6750A4; border-radius: 3px; min-width: 1px; }
</style></head><body>
<h1>Informe de HueckoApp</h1>
<p class="muted">Del ${dmy(period.fromDate)} al ${dmy(period.toDate)} · generado el ${escapeHtml(formatDateTime(new Date(report.generatedAt)))}</p>
<h2>Resumen</h2>
<div class="tiles">${tiles.map(([label, value]) => `<div class="tile"><b>${escapeHtml(String(value))}</b>${escapeHtml(label)}</div>`).join('')}</div>
<h2>${report.bucket === 'day' ? 'Evolución por día' : 'Evolución por semana'}</h2>
${htmlTable(
  ['Inicio', 'Registros', 'Grupos creados', 'Propuestas creadas', 'Llamadas a la IA'],
  report.timeseries.map((p) => [dmy(p.start), p.registrations, p.groupsCreated, p.proposalsCreated, p.aiCalls]),
)}
<h2>Propuestas del periodo por estado</h2>
${htmlBars(PROPOSAL_STATE_ORDER.map((s) => ({ label: STATE_BADGE[s].text, value: report.proposalsByState[s] })))}
<h2>Uso de la IA por función</h2>
${htmlTable(
  ['Función', 'Llamadas', 'Correctas', 'Éxito', 'Duración media'],
  report.ai.byTask.map((t) => [AI_TASK_LABEL[t.task], t.calls, t.ok, percentLabel(t.successRate), t.avgDurationMs === null ? null : `${t.avgDurationMs} ms`]),
)}
<h2>Hora de inicio de los planes confirmados</h2>
${activeHours.length > 0 ? htmlBars(activeHours.map((h) => ({ label: hourLabel(h.hour), value: h.count }))) : '<p class="muted">Ningún plan confirmado en este periodo.</p>'}
<h2>Grupos con más propuestas</h2>
${report.topGroups.length > 0 ? htmlTable(['Grupo', 'Propuestas'], report.topGroups.map((g) => [g.name, g.proposals])) : '<p class="muted">Ningún grupo creó propuestas en este periodo.</p>'}
</body></html>`;
}
