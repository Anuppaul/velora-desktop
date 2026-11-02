// A monotonic, non-timer frame budget for compositor callbacks.
// No timeout is installed: callers run only when GNOME already paints.
// A reset/backwards timestamp triggers an immediate refresh.
export function frameDue(nowUs, lastUs, fps) {
    return !lastUs ||
        nowUs < lastUs ||
        nowUs - lastUs >= 1000000 / fps;
}
