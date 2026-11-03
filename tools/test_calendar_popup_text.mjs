import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Exercise the actual shipped GJS sampling/polarity methods with fake pixels;
// the tests run in Node without a GNOME session or screenshot permissions.
const file = name => readFile(new URL(
    '../gnome-shell/vliq@wonderer.tech/' + name, import.meta.url
), 'utf8');
const popup = await file('popupGlass.js');
const banner = await file('notificationGlass.js');
const css = await file('runtime.css');
const constants = (source, name) => {
    const match = source.match(new RegExp(
        '^const ' + name + ' = ([0-9.]+);', 'm'
    ));
    assert.ok(match, 'missing threshold ' + name);
    return Number(match[1]);
};
function checkThresholds(source) {
    const names = ['CARD_WHITE_MIN_CHANNEL', 'CARD_WHITE_MAX_SPREAD',
        'CARD_WHITE_ENTER_RATIO', 'CARD_WHITE_EXIT_RATIO'];
    const values = names.map(name => constants(source, name));
    assert.ok(values[2] > values[3], 'hysteresis thresholds must be ordered');
    return values;
}
const popLimits = checkThresholds(popup);
const noteLimits = checkThresholds(banner);
assert.deepEqual(popLimits, noteLimits, 'same policy on every surface');
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
function methods(source, first, last) {
    const start = source.indexOf(first);
    const end = source.indexOf(last, start);
    assert.ok(start >= 0 && end > start, 'methods present: ' + first);
    return source.slice(start, end);
}
const popupMethods = methods(popup,
    '    _dateCardWhiteRatio(frame, actor) {',
    '    _applyDateCardTextPolarity(actor, useDarkText) {'
);
const PopupPolicy = new Function(
    'finiteRect', 'dateCardClass', 'clampNumber', 'DATE_CARD_SAMPLE_GRID',
    'CARD_WHITE_MIN_CHANNEL', 'CARD_WHITE_MAX_SPREAD',
    'CARD_WHITE_ENTER_RATIO', 'CARD_WHITE_EXIT_RATIO',
    'return class PopupPolicy {\n' + popupMethods + '\n}'
)(
    r => r.every(Number.isFinite) && r[2] > 1 && r[3] > 1,
    actor => actor.style_class,
    clamp, constants(popup, 'DATE_CARD_SAMPLE_GRID'), ...popLimits
);
const popupPolicy = new PopupPolicy();
popupPolicy._vendor = {getTransformedRect: () => [0, 0, 128, 128]};
popupPolicy._dateCardTextState = new Map();
function pixelFrame(rgb, whiteRows = -1, channels = 3) {
    const width = 128, height = 128;
    const data = new Uint8Array(width * height * channels);
    for (let y = 0; y < height; y++) {
        const color = whiteRows < 0 || y < whiteRows
            ? rgb : [150, 150, 150];
        for (let x = 0; x < width; x++) {
            const start = (y * width + x) * channels;
            for (let c = 0; c < 3; c++)
                data[start + c] = color[c];
            if (channels === 4)
                data[start + 3] = 255;
        }
    }
    return {x: 0, y: 0, width, height,
        stride: width * channels, channels, data};
}
const palette = [
    [[255, 255, 255], true],
    [[240, 240, 240], true],
    [[234, 233, 231], true],
    [[188, 188, 188], false],
    [[15, 20, 33], false],
    [[255, 238, 30], false],  // bright yellow must keep white text
    [[35, 205, 245], false], // bright cyan must keep white text
    [[241, 196, 219], false],// bright pink must keep white text
    [[44, 220, 85], false],  // green is not neutral white
];
const cards = [
    'calendar', 'datemenu-today-button', 'events-button',
    'world-clocks-button', 'weather-button', 'message',
    'message-list-clear-button', 'quick-toggle', 'quick-slider',
    'quick-toggle-menu', 'quick-toggle-has-menu', 'system-icon-button',
];
for (const card of cards) {
    const actor = {style_class: card};
    for (const [rgb, wantBlack] of palette) {
        popupPolicy._dateCardTextState.clear();
        const ratio = popupPolicy._dateCardWhiteRatio(pixelFrame(rgb), actor);
        assert.equal(popupPolicy._chooseDateCardDarkText(actor, ratio),
            wantBlack, card + ': wrong text polarity for ' + rgb);
    }
    // RGBA screenshot path must agree with the normal RGB capture.
    const ratio = popupPolicy._dateCardWhiteRatio(
        pixelFrame([255, 255, 255], -1, 4), actor
    );
    assert.equal(popupPolicy._chooseDateCardDarkText(actor, ratio), true);
}
// The partial near-white background falls inside the hysteresis band:
const mixedCard = {style_class: 'message'};
const mixedRatio = popupPolicy._dateCardWhiteRatio(
    pixelFrame([255, 255, 255], 85), mixedCard
);
assert.ok(mixedRatio > popLimits[3] && mixedRatio < popLimits[2],
    'partial white glass must land inside transition band');
popupPolicy._dateCardTextState.set(mixedCard, false);
assert.equal(popupPolicy._chooseDateCardDarkText(mixedCard, mixedRatio), false);
popupPolicy._dateCardTextState.set(mixedCard, true);
assert.equal(popupPolicy._chooseDateCardDarkText(mixedCard, mixedRatio), true);
assert.equal(popupPolicy._chooseDateCardDarkText(mixedCard, null), null);

// Popup defaults to white before the first asynchronous sample.
assert.match(popup, /if \(!this\._dateCardTextState\.has\(actor\)\)/);
assert.match(popup, /this\._applyDateCardTextPolarity\(actor, false\)/);
assert.match(css, /\.calendar\.vliq-date-card-text-dark \.calendar-day \{/);
assert.match(css, /\.calendar\.vliq-date-card-text-dark \.calendar-day-heading,/);
assert.match(css, /color: #111111 !important;/);
assert.match(css, /\.calendar \.calendar-month-label,/);
assert.match(css, /color: #ffffff !important;/);
assert.match(css, /\.vliq-date-card-text-dark StLabel/);
assert.match(css, /\.vliq-quick-card-text-dark StLabel/);
assert.match(css, /\.vliq-liquid-quick-menu-root \.vliq-quick-card-text-light/);
assert.match(css, /\.vliq-liquid-quick-menu-root \.vliq-quick-card-text-dark/);

const bannerMethods = methods(banner,
    '    _bannerWhiteRatio(frame) {',
    '    _applyTextPolarity(material, useDarkText) {'
);
const BannerPolicy = new Function(
    'clampNumber',
    'CARD_WHITE_MIN_CHANNEL', 'CARD_WHITE_MAX_SPREAD',
    'CARD_WHITE_ENTER_RATIO', 'CARD_WHITE_EXIT_RATIO',
    'return class BannerPolicy {\n' + bannerMethods + '\n}'
)(clamp, ...noteLimits);
const bannerPolicy = new BannerPolicy();
const material = {useDarkText: null};
for (const [rgb, wantBlack] of palette) {
    material.useDarkText = null;
    const ratio = bannerPolicy._bannerWhiteRatio(pixelFrame(rgb));
    assert.equal(bannerPolicy._chooseDarkText(material, ratio), wantBlack,
        'notification banner: wrong text polarity for ' + rgb);
}
const mixedBanner = bannerPolicy._bannerWhiteRatio(
    pixelFrame([255, 255, 255], 85)
);
assert.ok(mixedBanner > noteLimits[3] && mixedBanner < noteLimits[2]);
material.useDarkText = false;
assert.equal(bannerPolicy._chooseDarkText(material, mixedBanner), false);
material.useDarkText = true;
assert.equal(bannerPolicy._chooseDarkText(material, mixedBanner), true);
assert.equal(bannerPolicy._chooseDarkText(material, null), null);
assert.match(banner, /actor\.add_style_class_name\?\.\(TEXT_LIGHT_CLASS\)/);
assert.match(css, /\.vliq-native-notification-glass\.vliq-notification-text-dark/);
assert.match(css, /\.vliq-native-notification-glass\.vliq-notification-text-light/);

// Selected accent badges and today's date keep their established white glyphs.
const integration = await file('liquidGlassDock.js');
const accentBegin = integration.indexOf('/* VLIQ semantic accent: preserve');
const accentEnd = integration.indexOf(
    "'.vliq-liquid-popup-content.quick-settings", accentBegin
);
assert.ok(accentBegin >= 0 && accentEnd > accentBegin);
const accentSection = integration.slice(accentBegin, accentEnd);
assert.match(accentSection, /background-color:/);
assert.match(accentSection, /color: #ffffff !important/);
assert.doesNotMatch(accentSection, /'  color: ' \+ accentColor/);
assert.match(css, /\.calendar-day\.calendar-today/);
// GNOME 50 represents an active Wi-Fi hotspot using the existing Wi-Fi
// QuickMenuToggle (the network indicator's _wirelessToggle), not a new tile.
// Verify detection is stateful and never changes ordinary toggle colours.
const hotspotClasses = new Set();
const hotspot = {
    _itemBinding: {source: {is_hotspot: true}},
    has_style_class_name: name => hotspotClasses.has(name),
    add_style_class_name: name => hotspotClasses.add(name),
    remove_style_class_name: name => hotspotClasses.delete(name),
};
const main = {panel: {statusArea: {quickSettings: {
    _network: {_wirelessToggle: hotspot},
}}}};
const hotspotMethods = methods(popup,
    '    _quickHotspotToggle() {',
    '    _applyQuickThemeForegroundPolarity() {'
);
const HotspotPolicy = new Function(
    'Main', 'QUICK_HOTSPOT_CLASS',
    'return class HotspotPolicy {\n' + hotspotMethods + '\n}'
)(main, 'vliq-quick-hotspot');
const hotPolicy = new HotspotPolicy();
hotPolicy._isQuickSettings = true;
hotPolicy._dateCardActors = [hotspot];
hotPolicy._dateCardTextState = new Map();
const initialPolarity = [];
hotPolicy._applyDateCardTextPolarity = (actor, black) => {
    initialPolarity.push(black);
    hotPolicy._dateCardTextState.set(actor, black);
};
hotPolicy._syncQuickHotspotState();
assert.ok(hotspotClasses.has('vliq-quick-hotspot'));
assert.deepEqual(initialPolarity, [false], 'hotspot first paint stays white');
hotPolicy._syncQuickHotspotState();
assert.deepEqual(initialPolarity, [false], 'stable hotspot state needs no repaint');
hotspot._itemBinding.source.is_hotspot = false;
hotPolicy._syncQuickHotspotState();
assert.ok(!hotspotClasses.has('vliq-quick-hotspot'),
    'normal Wi-Fi loses hotspot override');
hotPolicy._dateCardTextState.set(hotspot, true);
hotspot._itemBinding.source.is_hotspot = true;
hotPolicy._syncQuickHotspotState();
assert.ok(hotspotClasses.has('vliq-quick-hotspot'),
    'hotspot reactivation is detected');
assert.deepEqual(initialPolarity, [false],
    'existing near-white sampled polarity is preserved');
hotPolicy._dateCardActors = [];
hotPolicy._syncQuickHotspotState();
assert.ok(hotspotClasses.has('vliq-quick-hotspot'),
    'non-member actor must not be modified');
main.panel.statusArea.quickSettings._network = null;
assert.equal(hotPolicy._quickHotspotToggle(), null);
hotPolicy._isQuickSettings = false;
hotPolicy._syncQuickHotspotState();
assert.match(popup, /this\._syncQuickHotspotState\(\)/);
assert.match(popup, /notify::icon-name/);
assert.match(popup, /notify::title/);
assert.doesNotMatch(popup, /rgbLuminance\(/,
    'theme luminance must not override the sampled glass polarity');
const activeAccent = css.indexOf('.vliq-liquid-quick-menu-root .vliq-quick-active StLabel');
const hotspotLightRule = css.indexOf(
    '.vliq-liquid-quick-menu-root .vliq-quick-hotspot.vliq-quick-card-text-light StLabel'
);
const hotspotDarkRule = css.indexOf(
    '.vliq-liquid-quick-menu-root .vliq-quick-hotspot.vliq-quick-card-text-dark StLabel'
);
assert.ok(activeAccent > 0 && hotspotLightRule > activeAccent &&
    hotspotDarkRule > hotspotLightRule,
'Hotspot rules must outrank native active accent rule');
assert.match(css.slice(hotspotLightRule, hotspotDarkRule),
    /color: #ffffff !important;/);
assert.match(css.slice(hotspotDarkRule, hotspotDarkRule + 1200),
    /color: #111111 !important;/);
assert.match(css, /\.vliq-quick-hotspot\.vliq-quick-card-text-light \.quick-toggle-subtitle/);
assert.match(css, /\.vliq-quick-hotspot\.vliq-quick-card-text-dark \.quick-toggle-icon/);

console.log(
    'VLIQ adaptive text: Calendar, Date cards, Quick Settings + overlays, ' +
    'notification banners, near-white hysteresis and accent states PASS.'
);
