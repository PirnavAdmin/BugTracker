const parseDurationMinutes = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === "string" && value.trim()) {
    const parsedValue = Number(value);

    if (Number.isFinite(parsedValue)) {
      return Math.round(parsedValue);
    }
  }

  return NaN;
};

const parseMeetingDateTime = (value) => {
  if (!value) {
    return null;
  }

  const parsedDate = new Date(value);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return parsedDate;
};

const resolveMeetingWindow = ({ startDateTime, endDateTime, durationMinutes }) => {
  const startDate = parseMeetingDateTime(startDateTime);

  if (!startDate) {
    return {
      error: "Meeting start date and time is required",
    };
  }

  const parsedEndDate = parseMeetingDateTime(endDateTime);

  if (parsedEndDate) {
    if (parsedEndDate.getTime() <= startDate.getTime()) {
      return {
        error: "Meeting end time must be after the start time",
      };
    }

    return {
      startDate,
      endDate: parsedEndDate,
      durationMinutes: Math.max(
        5,
        Math.round((parsedEndDate.getTime() - startDate.getTime()) / (60 * 1000))
      ),
    };
  }

  const parsedDurationMinutes = parseDurationMinutes(durationMinutes);

  if (!Number.isFinite(parsedDurationMinutes) || parsedDurationMinutes < 5) {
    return {
      error: "Meeting duration must be at least 5 minutes",
    };
  }

  return {
    startDate,
    endDate: new Date(startDate.getTime() + parsedDurationMinutes * 60 * 1000),
    durationMinutes: parsedDurationMinutes,
  };
};

module.exports = {
  resolveMeetingWindow,
};
