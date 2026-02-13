import moment from "moment";
import "moment-timezone"
const TZ = process.env.NEXT_TIMEZONE
moment.tz.setDefault(TZ)

export const paramsSerializer = (params: any) => {
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null || v === '') return;
        if (Array.isArray(v)) {
            v.forEach((item) => usp.append(k, String(item)));
        } else {
            usp.append(k, String(v));
        }
    });
    return usp.toString();
};


export const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const parseDateInput = (input?: string | number | Date): Date => {
    if (!input) return new Date(NaN);
    if (input instanceof Date) return input;
    if (typeof input === 'number') return new Date(input);
    const raw = String(input).trim();
    // If ISO-like or includes timezone info, let Date parse it
    if (raw.includes('T') || raw.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(raw)) {
        return new Date(raw);
    }
    // Handle common "yyyy-MM-dd HH:mm:ss" (no timezone) as UTC
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[\s](\d{2}):(\d{2}):(\d{2})$/);
    if (m) {
        const [, y, mo, d, h, mi, s] = m;
        return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)));
    }
    // Fallback to native parse
    return new Date(raw);
};

export const formatDateTime = (
    input?: string | number | Date,
    locale?: string,
    options?: Intl.DateTimeFormatOptions
): string => {
    const date = parseDateInput(input);
    if (Number.isNaN(date.getTime())) return '—';
    try {
        return new Intl.DateTimeFormat(locale || undefined, {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: 'numeric',
            minute: '2-digit',
            ...options,
        }).format(date);
    } catch {
        return '—';
    }
};

export const formatRelativeTime = (input?: string | number | Date): string => {
    const date = parseDateInput(input);
    if (Number.isNaN(date.getTime())) return '—';
    try {
        const now = new Date();
        const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
        const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

        const absSec = Math.abs(diffSeconds);
        if (absSec < 60) return rtf.format(diffSeconds, 'second');
        const diffMinutes = Math.round(diffSeconds / 60);
        const absMin = Math.abs(diffMinutes);
        if (absMin < 60) return rtf.format(diffMinutes, 'minute');
        const diffHours = Math.round(diffMinutes / 60);
        const absHr = Math.abs(diffHours);
        if (absHr < 24) return rtf.format(diffHours, 'hour');
        const diffDays = Math.round(diffHours / 24);
        const absDay = Math.abs(diffDays);
        if (absDay < 7) return rtf.format(diffDays, 'day');
        const diffWeeks = Math.round(diffDays / 7);
        const absWeek = Math.abs(diffWeeks);
        if (absWeek < 5) return rtf.format(diffWeeks, 'week');
        const diffMonths = Math.round(diffDays / 30);
        const absMonth = Math.abs(diffMonths);
        if (absMonth < 12) return rtf.format(diffMonths, 'month');
        const diffYears = Math.round(diffDays / 365);
        return rtf.format(diffYears, 'year');
    } catch {
        return '—';
    }
};

export const todayDates = () => {
    const now = moment();
    const mid = moment(now).startOf('day');
    const end = moment(now).endOf('day');
    return [mid.format('YYYY-MM-DD HH:mm:ss'), end.format('YYYY-MM-DD HH:mm:ss')];
};

export const convertDate = (date:Date, end:boolean = false) => {
    let d = moment(date);
    if (end) {
        d = moment(d).endOf('day');
    } else {
        d = moment(d).startOf('day');
    }
    return d.format('YYYY-MM-DD HH:mm:ss');
};
