export const INDIAN_TIME_ZONE = "Asia/Kolkata";
export const INDIAN_LOCALE = "en-IN";

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

export const formatDate = (value, options = {}) => {
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

export const formatDatePickerDisplay = (value, options = {}) => {
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

export const formatTime = (value, options = {}) => {
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

export const formatDateTime = (value, options = {}) => {
  const date = toDate(value);

  if (!date) {
    return options.fallback ?? "Not started";
  }

  return `${formatDate(date, options)}, ${formatTime(date, options)}`;
};

export const getIndianDateKey = (value) => {
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

export const formatRelativeDateLabel = (value, options = {}) => {
  const date = toDate(value);

  if (!date) {
    return options.fallback ?? "Not set";
  }

  const todayKey = getIndianDateKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = getIndianDateKey(yesterday);
  const dateKey = getIndianDateKey(date);

  if (dateKey === todayKey) {
    return "Today";
  }

  if (dateKey === yesterdayKey) {
    return "Yesterday";
  }

  return formatDate(date, options);
};
