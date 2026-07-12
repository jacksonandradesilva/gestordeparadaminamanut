export function formatDateTime(date) {
  const options = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  };

  return new Intl.DateTimeFormat('pt-BR', options).format(date);
}

export function parseTimeToMinutes(timeValue) {
  if (!timeValue || !timeValue.includes(':')) {
    return null;
  }

  const [hoursText, minutesText] = timeValue.split(':');
  const hours = Number(hoursText);
  const minutes = Number(minutesText);

  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return (hours * 60) + minutes;
}

export function getDurationInMinutes(item) {
  const startMinutes = parseTimeToMinutes(item.horaInicio);
  const endMinutes = parseTimeToMinutes(item.horaFim);

  if (startMinutes === null || endMinutes === null) {
    return 0;
  }

  if (endMinutes >= startMinutes) {
    return endMinutes - startMinutes;
  }

  return (24 * 60) - startMinutes + endMinutes;
}

export function formatMinutes(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return String(hours).padStart(2, '0') + ':' + String(minutes).padStart(2, '0');
}
