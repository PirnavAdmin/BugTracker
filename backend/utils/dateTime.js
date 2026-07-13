const INDIAN_TIME_ZONE = "Asia/Kolkata";
const INDIAN_LOCALE = "en-IN";
const INDIAN_UTC_OFFSET_MINUTES = 330;

const MONTH_INDEX_BY_NAME = new Map([
  ["jan", 1],
  ["january", 1],
  ["feb", 2],
  ["february", 2],
  ["mar", 3],
  ["march", 3],
  ["apr", 4],
  ["april", 4],
  ["may", 5],
  ["jun", 6],
  ["june", 6],
  ["jul", 7],
  ["july", 7],
  ["aug", 8],
  ["august", 8],
  ["sep", 9],
  ["sept", 9],
  ["september", 9],
  ["oct", 10],
  ["october", 10],
  ["nov", 11],
  ["november", 11],
  ["dec", 12],
  ["december", 12],
]);

const DATE_PART_OPTIONS = {
  day: "2-digit",
  month: "short",
  year: "numeric",
};

const DATE_PICKER_PART_OPTIONS = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

const TIME_PART_OPTIONS = {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
};

const formatterCache = new Map();

const getFormatter = (options = {}) => {
  const cacheKey = JSON.stringify(options);

  if (!formatterCache.has(cacheKey)) {
    formatterCache.set(
      cacheKey,
      new Intl.DateTimeFormat(INDIAN_LOCALE, {
        timeZone: INDIAN_TIME_ZONE,
        ...options,
      })
    );
  }

  return formatterCache.get(cacheKey);
};

const toDate = (value) => {
  if (!value) {
    return null;
  }

  const parsedValue = value instanceof Date ? new Date(value.getTime()) : new Date(value);

  return Number.isNaN(parsedValue.getTime()) ? null : parsedValue;
};

const getPartsMap = (value, options) =>
  getFormatter(options)
    .formatToParts(value)
    .reduce((parts, part) => {
      if (part.type !== "literal") {
        parts[part.type] = part.value;
      }

      return parts;
    }, {});

const createUtcDateFromIndianParts = ({
  year,
  month,
  day,
  hours = 0,
  minutes = 0,
  seconds = 0,
  milliseconds = 0,
} = {}) => {
  if (!year || !month || !day) {
    return null;
  }

  return new Date(
    Date.UTC(year, month - 1, day, hours, minutes, seconds, milliseconds) -
      INDIAN_UTC_OFFSET_MINUTES * 60 * 1000
  );
};

const parseCommonDateString = (value, { endOfDay = false } = {}) => {
  const dateTimeLocalMatch = String(value || "")
    .trim()
    .match(
      /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/
    );

  if (dateTimeLocalMatch) {
    const [, year, month, day, hours, minutes, seconds = "0", milliseconds = "0"] =
      dateTimeLocalMatch;

    return createUtcDateFromIndianParts({
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hours: Number(hours),
      minutes: Number(minutes),
      seconds: Number(seconds),
      milliseconds: Number(String(milliseconds).padEnd(3, "0")),
    });
  }

  const dateOnlyMatch = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;

    return createUtcDateFromIndianParts({
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hours: endOfDay ? 23 : 0,
      minutes: endOfDay ? 59 : 0,
      seconds: endOfDay ? 59 : 0,
      milliseconds: endOfDay ? 999 : 0,
    });
  }

  const indianNumericMatch = String(value || "")
    .trim()
    .match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);

  if (indianNumericMatch) {
    const [, day, month, year] = indianNumericMatch;

    return createUtcDateFromIndianParts({
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hours: endOfDay ? 23 : 0,
      minutes: endOfDay ? 59 : 0,
      seconds: endOfDay ? 59 : 0,
      milliseconds: endOfDay ? 999 : 0,
    });
  }

  const indianMonthNameMatch = String(value || "")
    .trim()
    .match(/^(\d{1,2})[\s/-]([A-Za-z]+)[\s/-](\d{4})$/);

  if (indianMonthNameMatch) {
    const [, day, monthLabel, year] = indianMonthNameMatch;
    const month = MONTH_INDEX_BY_NAME.get(String(monthLabel || "").toLowerCase());

    if (!month) {
      return null;
    }

    return createUtcDateFromIndianParts({
      year: Number(year),
      month,
      day: Number(day),
      hours: endOfDay ? 23 : 0,
      minutes: endOfDay ? 59 : 0,
      seconds: endOfDay ? 59 : 0,
      milliseconds: endOfDay ? 999 : 0,
    });
  }

  return null;
};

const parseFlexibleDateInput = (value, { endOfDay = false } = {}) => {
  if (value === null || value === "" || typeof value === "undefined") {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsedValue = new Date(value);
    return Number.isNaN(parsedValue.getTime()) ? null : parsedValue;
  }

  const trimmedValue = String(value || "").trim();

  if (!trimmedValue) {
    return null;
  }

  const parsedCommonValue = parseCommonDateString(trimmedValue, { endOfDay });

  if (parsedCommonValue) {
    return parsedCommonValue;
  }

  const parsedValue = new Date(trimmedValue);

  return Number.isNaN(parsedValue.getTime()) ? null : parsedValue;
};

const formatDate = (value, options = {}) => {
  const date = toDate(value);

  if (!date) {
    return options.fallback ?? "Not set";
  }

  const parts = getPartsMap(date, {
    ...DATE_PART_OPTIONS,
    ...options,
  });

  return `${parts.day} ${parts.month} ${parts.year}`;
};

const formatDatePickerDisplay = (value, options = {}) => {
  const date = toDate(value);

  if (!date) {
    return options.fallback ?? "Not set";
  }

  const parts = getPartsMap(date, {
    ...DATE_PICKER_PART_OPTIONS,
    ...options,
  });

  return `${parts.day}-${parts.month}-${parts.year}`;
};

const formatTime = (value, options = {}) => {
  const date = toDate(value);

  if (!date) {
    return options.fallback ?? "Unknown time";
  }

  const parts = getPartsMap(date, {
    ...TIME_PART_OPTIONS,
    ...options,
  });

  return `${parts.hour}:${parts.minute} ${String(parts.dayPeriod || "").toUpperCase()}`.trim();
};

const formatDateTime = (value, options = {}) => {
  const date = toDate(value);

  if (!date) {
    return options.fallback ?? "Not set";
  }

  return `${formatDate(date, options)}, ${formatTime(date, options)}`;
};

const getIndianDateKey = (value) => {
  const date = toDate(value);

  if (!date) {
    return "";
  }

  const parts = getPartsMap(date, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return `${parts.year}-${parts.month}-${parts.day}`;
};

const formatMonthYear = (value, options = {}) => {
  const date = toDate(value);

  if (!date) {
    return options.fallback ?? "Not set";
  }

  const parts = getPartsMap(date, {
    month: "short",
    year: "numeric",
    ...options,
  });

  return `${parts.month} ${parts.year}`;
};

module.exports = {
  INDIAN_LOCALE,
  INDIAN_TIME_ZONE,
  createUtcDateFromIndianParts,
  formatDate,
  formatDatePickerDisplay,
  formatDateTime,
  formatMonthYear,
  formatTime,
  getIndianDateKey,
  parseFlexibleDateInput,
};
