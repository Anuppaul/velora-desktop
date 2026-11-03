import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// The real GNOME Date Menu Calendar is different from the desktop widget.
// Exercise VLIQ's shipped per-card sampling and polarity methods directly.
const file = name => readFile(new URL(
    '../gnome-shell/vliq@wonderer.tech/' + name, import.meta.url
), 'utf8');
const source = await file('popupGlass.js');
const start = source.indexOf('    _dateCardLuminance(frame, actor) {');
const end = source.indexOf('    _applyDateCardTextPolarity(actor,', start);
assert.ok(start >= 0 && end > start, 'calendar polarity methods exist');
const methods = source.slice(start, end);
const constant = name => {
    const result = source.match(new RegExp(
        '^const ' + name + ' = ([0-9.]+);', 'm'
    ));
    assert.ok(result, 'source constant: ' + name);
    return Number(result[1]);
};
const MIN_CHANNEL = constant('CALENDAR_WHITE_MIN_CHANNEL');
const MAX_SPREAD = constant('CALENDAR_WHITE_MAX_SPREAD');
const ENTER = constant('CALENDAR_WHITE_ENTER_RATIO');
const EXIT = constant('CALENDAR_WHITE_EXIT_RATIO');
assert.ok(ENTER > EXIT, 'white-background transition is hysteretic');

function rgbLuminance(r, g, b) {
    const gamma = c => {
        const v = c / 255;
        return v <= 0.04045
            ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * gamma(r) + 0.7152 * gamma(g) + 0.0722 * gamma(b);
}
function trimmedMean(values, ratio = 0.3) {
    if (!values.length) return null;
    values.sort((a, b) => a - b);
    const t = Math.min(Math.floor(values.length * ratio),
        Math.floor((values.length - 1) / 2));
    return values.slice(t, values.length - t)
        .reduce((sum, v) => sum + v, 0) / (values.length - 2 * t);
}
const Policy = new Function(
    'finiteRect', 'dateCardClass', 'clampNumber', 'rgbLuminance',
    'trimmedMean', 'contrastRatio', 'DATE_CARD_SAMPLE_GRID',
    'CALENDAR_WHITE_MIN_CHANNEL', 'CALENDAR_WHITE_MAX_SPREAD',
    'CALENDAR_WHITE_ENTER_RATIO', 'CALENDAR_WHITE_EXIT_RATIO',
    'DATE_LIGHT_LUMA', 'DATE_DARK_LUMA',
    'DATE_MIN_READABLE_CONTRAST', 'DATE_TEXT_SWITCH_ADVANTAGE',
    'return class Policy {\n' + methods + '\n}'
)(
    values => values.every(Number.isFinite) &&
        values[2] > 1 && values[3] > 1,
    actor => actor.style_class === 'calendar' ? 'calendar' : 'events-button',
    (x, lo, hi) => Math.min(hi, Math.max(lo, x)),
    rgbLuminance, trimmedMean,
    (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05),
    28, MIN_CHANNEL, MAX_SPREAD, ENTER, EXIT, .94, .02, 4.5, 1.18
);
const calendar = {style_class: 'calendar'};
const eventCard = {style_class: 'events-button'};
const policy = new Policy();
policy._isDateMenu = true;
policy._vendor = {getTransformedRect: () => [0, 0, 128, 128]};
policy._calendarNearWhiteRatio = new WeakMap();
policy._dateCardTextState = new Map();

function pixelFrame(rgb, whiteRows = -1) {
    const width = 128, height = 128, channels = 3;
    const data = new Uint8Array(width * height * channels);
    for (let y = 0; y < height; y++) {
        const color = whiteRows < 0 || y < whiteRows
            ? rgb : [150, 150, 150];
        for (let x = 0; x < width; x++) {
            const start = (y * width + x) * channels;
            data[start] = color[0];
            data[start + 1] = color[1];
            data[start + 2] = color[2];
        }
    }
    return {x: 0, y: 0, width, height,
        stride: width * channels, channels, data};
}
function expectCalendarText(bg, black) {
    policy._dateCardTextState.delete(calendar);
    const luma = policy._dateCardLuminance(pixelFrame(bg), calendar);
    const actual = policy._chooseDateCardDarkText(calendar, luma);
    assert.equal(actual, black, 'wrong polarity for ' + bg.join(','));
}
expectCalendarText([255, 255, 255], true);
expectCalendarText([240, 240, 240], true);
expectCalendarText([234, 233, 231], true);
expectCalendarText([188, 188, 188], false);
expectCalendarText([15, 20, 33], false);
expectCalendarText([255, 238, 30], false);  // bright yellow != white
expectCalendarText([35, 205, 245], false);  // bright blue != white
expectCalendarText([241, 196, 219], false); // bright pink != white

// The two thresholds avoid flicker on patterned near-white wallpaper.
let measured = policy._dateCardLuminance(
    pixelFrame([255, 255, 255], 85), calendar);
const whiteRatio = policy._calendarNearWhiteRatio.get(calendar);
assert.ok(whiteRatio > EXIT && whiteRatio < ENTER,
    'mixed pixels must fall inside hysteresis band');
policy._dateCardTextState.set(calendar, false);
assert.equal(policy._chooseDateCardDarkText(calendar, measured), false);
policy._dateCardTextState.set(calendar, true);
assert.equal(policy._chooseDateCardDarkText(calendar, measured), true);

// Non-calendar cards keep their existing contrast-based algorithm unchanged.
const lumaEvent = policy._dateCardLuminance(
    pixelFrame([255, 255, 255]), eventCard);
assert.equal(policy._calendarNearWhiteRatio.has(eventCard), false);
assert.equal(policy._chooseDateCardDarkText(eventCard, lumaEvent), true);

const css = await file('runtime.css');
assert.match(css, /\.calendar\.vliq-date-card-text-dark \.calendar-day-heading,/);
assert.match(css, /\.calendar\.vliq-date-card-text-dark \.calendar-day \{/);
assert.match(css, /color: #111111 !important;/);
assert.match(css, /\.calendar \.calendar-month-label,/);
assert.match(css, /color: #ffffff !important;/);
const integration = await file('liquidGlassDock.js');
const accentSection = integration.slice(integration.indexOf(
    '/* VLIQ semantic accent: preserve'
), integration.indexOf('/* VLIQ semantic accent: preserve') + 460);
assert.match(accentSection, /background-color:/);
assert.match(accentSection, /color: #ffffff !important/);
assert.doesNotMatch(accentSection, /color: ' \+ accentColor/);
console.log(
    'Main Calendar popup: black on near-white only; white on all other backgrounds PASS.'
);
