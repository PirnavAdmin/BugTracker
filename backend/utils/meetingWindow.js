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

const INDIAN_TIME_OFFSET_MINUTES = 330;
const DATE_TIME_WITHOUT_ZONE_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

const parseMeetingDateTime = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();
    const offsetlessMatch = trimmedValue.match(DATE_TIME_WITHOUT_ZONE_PATTERN);

    if (offsetlessMatch) {
      const [, year, month, day, hour, minute, second = "00"] = offsetlessMatch;
      const utcTimestamp =
        Date.UTC(
          Number(year),
          Number(month) - 1,
          Number(day),
          Number(hour),
          Number(minute),
          Number(second)
        ) -
        INDIAN_TIME_OFFSET_MINUTES * 60 * 1000;
      const parsedIndianLocalDate = new Date(utcTimestamp);

      return Number.isNaN(parsedIndianLocalDate.getTime()) ? null : parsedIndianLocalDate;
    }
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
