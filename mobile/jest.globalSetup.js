// Las fechas y horas de la app se muestran en la zona del teléfono y varios tests
// esperan la hora de Lima (UTC−5 todo el año). Se fija aquí, antes de que Jest cree
// los workers (que heredan el entorno), para que `npm test` pase igual en cualquier máquina o CI.
module.exports = () => {
  process.env.TZ = 'America/Lima';
};
