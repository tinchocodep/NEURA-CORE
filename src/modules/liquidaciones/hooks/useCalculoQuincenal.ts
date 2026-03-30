import type { Ausencia, Empleado } from '../types';

interface FichajeCalc {
  fecha: string;
  hora_entrada: string;
  hora_salida: string;
  es_feriado: boolean;
}

interface ResultadoEmpleado {
  empleado_id: string;
  horas_normales: number;
  horas_extra_50: number;
  horas_extra_100: number;
  minutos_tardanza: number;
  minutos_salida_anticipada: number;
  cant_tardanzas: number;
  dias_ausencia_injustificada: number;
  dias_visita_medica: number;
  dias_art: number;
  dias_vacaciones: number;
  dias_permiso: number;
  tiene_presentismo: boolean;
  motivo_sin_presentismo: string | null;
  monto_presentismo: number;
  plus_revestimiento: number;
  subtotal_normal: number;
  subtotal_extras: number;
  total_bruto: number;
  valor_hora: number;
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function getDayOfWeek(fecha: string): number {
  return new Date(fecha + 'T12:00:00').getDay(); // 0=Sun, 6=Sat
}

/**
 * Calcula tardanza en bloques de 30 min.
 * Después de 7:50 = tarde.
 * 7:51 → 30min, 8:21 → 60min, etc.
 */
function calcTardanza(entradaMin: number): { minutos: number; esTarde: boolean } {
  const limiteMin = timeToMinutes('07:50'); // 470
  if (entradaMin <= limiteMin) return { minutos: 0, esTarde: false };

  const inicioTurno = timeToMinutes('08:00'); // 480
  const llegaTarde = entradaMin > limiteMin;

  if (!llegaTarde) return { minutos: 0, esTarde: false };

  // Diferencia desde las 8:00 (inicio turno) redondeada en bloques de 30 min
  const diffFromStart = Math.max(0, entradaMin - inicioTurno);
  // Un minuto tarde = 30 min, 31 min = 60 min, etc.
  const bloques = Math.ceil((diffFromStart + 1) / 30); // +1 porque 7:51 ya es 30 min
  const minutos = bloques * 30;

  return { minutos: Math.max(30, minutos), esTarde: true };
}

/**
 * Calcula salida anticipada en bloques de 30 min.
 * 1 min antes → 30 min, 31 min antes → 60 min, etc.
 */
function calcSalidaAnticipada(salidaMin: number, finTurnoMin: number): number {
  if (salidaMin >= finTurnoMin) return 0;
  const diff = finTurnoMin - salidaMin;
  const bloques = Math.ceil(diff / 30);
  return bloques * 30;
}

/**
 * Calcula horas extra.
 * Hora de llegada temprana: máx 1h extra (entre 7:00 y 8:00).
 * Post-turno hasta 22:00: +50%.
 * Post 22:00: +100%.
 * Sábados: todo +50% (feriado en sábado: +100%).
 * Horas se cuentan completas (excepto 1.5h).
 */
function calcExtras(entrada: number, salida: number, diaSemana: number, esFeriado: boolean, finTurno: number) {
  let extra50 = 0;
  let extra100 = 0;

  const isSaturday = diaSemana === 6;

  if (isSaturday) {
    // Sábado: todas las horas son extra
    const horasTrabajadas = Math.max(0, salida - entrada - 60) / 60; // -60 lunch
    const horasEnteras = truncToHalf(horasTrabajadas);
    if (esFeriado) {
      extra100 = horasEnteras;
    } else {
      extra50 = horasEnteras;
    }
    return { extra50, extra100 };
  }

  // Llegada temprana: máx 1h extra (de 7:00 a 8:00)
  const inicioTurno = timeToMinutes('08:00');
  if (entrada < inicioTurno) {
    const earlyMin = Math.min(inicioTurno - entrada, 60); // máx 1h
    if (earlyMin >= 60) extra50 += 1;
  }

  // Post-turno
  if (salida > finTurno) {
    const postTurno22 = timeToMinutes('22:00');

    // Horas entre fin de turno y 22:00 → +50%
    const hasta22 = Math.min(salida, postTurno22);
    const extraPostMin = Math.max(0, hasta22 - finTurno);
    const extraPostHrs = truncToHalf(extraPostMin / 60);
    if (esFeriado) {
      extra100 += extraPostHrs;
    } else {
      extra50 += extraPostHrs;
    }

    // Horas después de 22:00 → +100%
    if (salida > postTurno22) {
      const extraNochMin = salida - postTurno22;
      const extraNochHrs = truncToHalf(extraNochMin / 60);
      extra100 += extraNochHrs;
    }
  }

  return { extra50, extra100 };
}

/** Trunca a hora completa, permitiendo 1.5 */
function truncToHalf(hours: number): number {
  if (hours >= 1.5 && hours < 2) return 1.5;
  return Math.floor(hours);
}

/**
 * Calcula la liquidación quincenal para un empleado.
 */
export function calcularEmpleado(
  empleado: Empleado,
  fichajes: FichajeCalc[],
  ausencias: Ausencia[],
  valorHora: number,
): ResultadoEmpleado {
  let horasNormales = 0;
  let horasExtra50 = 0;
  let horasExtra100 = 0;
  let minutosTardanza = 0;
  let minutosSalidaAnt = 0;
  let cantTardanzas = 0;

  const ausCount = {
    injustificada: 0, visita_medica: 0, art: 0, vacaciones: 0, permiso: 0,
  };

  // Process ausencias
  ausencias.forEach(a => {
    if (a.tipo in ausCount) ausCount[a.tipo as keyof typeof ausCount]++;
  });

  // Process fichajes
  fichajes.forEach(f => {
    if (!f.hora_salida) return;
    const entrada = timeToMinutes(f.hora_entrada);
    const salida = timeToMinutes(f.hora_salida);
    const diaSemana = getDayOfWeek(f.fecha);
    const isSaturday = diaSemana === 6;

    // Fin de turno: Lu-Ju 18:00, Vi 17:00
    const isFriday = diaSemana === 5;
    const finTurno = isFriday ? timeToMinutes('17:00') : timeToMinutes('18:00');
    const inicioTurno = timeToMinutes('08:00');
    const almuerzoMin = 60; // 12:00-13:00

    if (isSaturday) {
      // Sábados: todo es extra
      const extras = calcExtras(entrada, salida, diaSemana, f.es_feriado, finTurno);
      horasExtra50 += extras.extra50;
      horasExtra100 += extras.extra100;
    } else {
      // Tardanza
      const tard = calcTardanza(entrada);
      if (tard.esTarde) {
        minutosTardanza += tard.minutos;
        cantTardanzas++;
      }

      // Salida anticipada
      const salidaAnt = calcSalidaAnticipada(salida, finTurno);
      minutosSalidaAnt += salidaAnt;

      // Horas normales: desde max(entrada, 8:00) hasta min(salida, finTurno) - almuerzo
      const efectivaEntrada = Math.max(entrada, inicioTurno);
      const efectivaSalida = Math.min(salida, finTurno);
      let normalMin = Math.max(0, efectivaSalida - efectivaEntrada - almuerzoMin);
      horasNormales += normalMin / 60;

      // Extras
      const extras = calcExtras(entrada, salida, diaSemana, f.es_feriado, finTurno);
      horasExtra50 += extras.extra50;
      horasExtra100 += extras.extra100;
    }
  });

  // Redondear horas
  horasNormales = Math.round(horasNormales * 100) / 100;
  horasExtra50 = Math.round(horasExtra50 * 100) / 100;
  horasExtra100 = Math.round(horasExtra100 * 100) / 100;

  // Presentismo: se pierde con...
  let tienePresentismo = true;
  let motivoSinPresentismo: string | null = null;

  if (ausCount.injustificada > 0) {
    tienePresentismo = false;
    motivoSinPresentismo = 'Ausencia injustificada';
  } else if (cantTardanzas >= 2) {
    tienePresentismo = false;
    motivoSinPresentismo = `${cantTardanzas} tardanzas`;
  } else if (ausCount.visita_medica >= 2) {
    tienePresentismo = false;
    motivoSinPresentismo = '2+ visitas médicas';
  } else if (ausCount.art > 0) {
    tienePresentismo = false;
    motivoSinPresentismo = 'ART';
  } else if (ausCount.vacaciones > 0) {
    tienePresentismo = false;
    motivoSinPresentismo = 'Vacaciones';
  } else if (cantTardanzas >= 1 && ausCount.visita_medica >= 1) {
    tienePresentismo = false;
    motivoSinPresentismo = 'Tardanza + visita médica';
  }

  // Revestimiento
  const revPct = empleado.es_revestimiento ? empleado.revestimiento_porcentaje : 0;
  const valorHoraEfectivo = valorHora * (1 + revPct / 100);

  // Cálculos monetarios
  const subtotalNormal = horasNormales * valorHoraEfectivo;
  const subtotalExtras = (horasExtra50 * valorHoraEfectivo * 1.5) + (horasExtra100 * valorHoraEfectivo * 2);
  const montoPresentismo = tienePresentismo ? horasNormales * valorHoraEfectivo * 0.2 : 0;
  const plusRevestimiento = empleado.es_revestimiento ? horasNormales * valorHora * (revPct / 100) : 0;

  const totalBruto = subtotalNormal + subtotalExtras + montoPresentismo;

  return {
    empleado_id: empleado.id,
    horas_normales: horasNormales,
    horas_extra_50: horasExtra50,
    horas_extra_100: horasExtra100,
    minutos_tardanza: minutosTardanza,
    minutos_salida_anticipada: minutosSalidaAnt,
    cant_tardanzas: cantTardanzas,
    dias_ausencia_injustificada: ausCount.injustificada,
    dias_visita_medica: ausCount.visita_medica,
    dias_art: ausCount.art,
    dias_vacaciones: ausCount.vacaciones,
    dias_permiso: ausCount.permiso,
    tiene_presentismo: tienePresentismo,
    motivo_sin_presentismo: motivoSinPresentismo,
    monto_presentismo: Math.round(montoPresentismo * 100) / 100,
    plus_revestimiento: Math.round(plusRevestimiento * 100) / 100,
    subtotal_normal: Math.round(subtotalNormal * 100) / 100,
    subtotal_extras: Math.round(subtotalExtras * 100) / 100,
    total_bruto: Math.round(totalBruto * 100) / 100,
    valor_hora: valorHoraEfectivo,
  };
}
