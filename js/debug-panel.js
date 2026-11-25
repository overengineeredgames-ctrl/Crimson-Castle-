/* Lightweight diagnostics for Link and Door tools.
 * Deliberately does not observe canvas pointer events or wrap hot-path handlers:
 * diagnostics must never be able to stall gameplay.
 */
(function () {
    "use strict";

    const D = window.CCDebug = {
        entries: [],
        checks: {},
        panel: null,

        snapshot() {
            const B = window.Building, W = window.Weapons, G = window.Game;
            return {
                gameState: G && G.state,
                doorMaterial: B && B.doorMaterial,
                normalMaterial: B && B.material,
                doorDrag: !!(B && B.doorModifierDrag),
                doorCandidate: !!(B && B.doorModifierDrag && B.doorModifierDrag.candidate),
                confirmReady: !!(B && B.doorModifierDrag && B.doorModifierDrag.confirmReady),
                linkMode: !!(W && W.linkMode),
                selectedTool: W && W.selectedTool,
                selectedCannon: !!(W && W.selectedCannon),
                selectedCannons: W && W.selectedCannons && W.selectedCannons.length,
                linkSource: !!(W && W.linkSource),
                cannons: W && W.cannons && W.cannons.length,
                doors: B && B.struts ? B.struts.filter(s => s.isDoor && !s.removed).length : 0
            };
        },

        report(section, status, message, details) {
            const entry = {
                time: new Date().toLocaleTimeString(),
                section,
                status,
                message: String(message || ""),
                details: details || null
            };
            this.entries.push(entry);
            if (this.entries.length > 120) this.entries.shift();
            this.checks[section] = entry;
            this.render();
            return entry;
        },

        reportText() {
            return JSON.stringify({
                app: "Crimson Castle debug",
                generated: new Date().toISOString(),
                snapshot: this.snapshot(),
                checks: Object.values(this.checks),
                recentEvents: this.entries.slice(-80)
            }, null, 2);
        },

        render() {
            if (!this.panel) return;
            const summary = this.panel.querySelector("#cc-debug-summary");
            const log = this.panel.querySelector("#cc-debug-log");
            const output = this.panel.querySelector("#cc-debug-report");
            const rows = Object.values(this.checks).slice(-12);
            if (summary) summary.textContent = rows.map(e =>
                e.status + "  " + e.section + ": " + e.message
            ).join("\n") || "Waiting for interactions…";
            if (log) log.textContent = this.entries.slice(-30).map(e =>
                e.time + " [" + e.status + "] " + e.section + " — " + e.message
            ).join("\n");
            // Keep a selectable, up-to-date report visible. On Android, long-press
            // inside this field, choose Select all, then Copy—no copy button needed.
            if (output && document.activeElement !== output) output.value = this.reportText();
        },

        copy() {
            const output = this.panel && this.panel.querySelector("#cc-debug-report");
            if (output) {
                output.focus();
                output.select();
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(output.value);
                    } else {
                        document.execCommand("copy");
                    }
                } catch (_) {}
            }
        },

        wrap(obj, name, key) {
            if (!obj || typeof obj[name] !== "function" || obj[name].__ccDebug) return;
            const original = obj[name];
            const self = this;
            const wrapped = function (...args) {
                try {
                    const result = original.apply(this, args);
                    if (key) self.report(key, result === false ? "FAIL" : "PASS",
                        name + " returned " + String(result));
                    return result;
                } catch (error) {
                    self.report(key || name, "FAIL", name + " threw: " +
                        (error && (error.stack || error.message) || error));
                    throw error;
                }
            };
            wrapped.__ccDebug = true;
            obj[name] = wrapped;
        },

        init() {
            const panel = document.createElement("aside");
            panel.id = "cc-debug-panel";
            panel.innerHTML =
                '<button id="cc-debug-toggle" type="button">DEBUG</button>' +
                '<div id="cc-debug-body" hidden>' +
                '<header><b>CRIMSON CASTLE DEBUG</b>' +
                '<button id="cc-debug-copy" type="button">Copy</button>' +
                '<button id="cc-debug-clear" type="button">Clear</button>' +
                '<button id="cc-debug-close" type="button">×</button></header>' +
                '<small>To send the report on Android: long-press the report below → Select all → Copy. No button required.</small>' +
                '<pre id="cc-debug-summary"></pre>' +
                '<details><summary>Recent checkpoints</summary><pre id="cc-debug-log"></pre></details>' +
                '<textarea id="cc-debug-report" readonly spellcheck="false" aria-label="Selectable debug report"></textarea>' +
                '</div>';
            document.body.appendChild(panel);
            this.panel = panel;
            const body = panel.querySelector("#cc-debug-body");
            panel.querySelector("#cc-debug-toggle").onclick = () => {
                body.hidden = !body.hidden;
                if (!body.hidden) this.render();
            };
            panel.querySelector("#cc-debug-close").onclick = () => { body.hidden = true; };
            panel.querySelector("#cc-debug-copy").onclick = () => this.copy();
            panel.querySelector("#cc-debug-clear").onclick = () => {
                this.entries = [];
                this.checks = {};
                this.report("LOG", "PASS", "Log cleared.");
            };

            this.report("PANEL_INIT", "PASS", "Lightweight diagnostic panel loaded.");
            this.report("APP_OBJECTS",
                window.Building && window.Weapons && window.Game ? "PASS" : "FAIL",
                "Building, Weapons and Game globals " +
                (window.Building && window.Weapons && window.Game ? "available" : "missing"));
            this.wrap(window.Building, "setDoorMaterial", "DOOR_BUTTON");
            this.wrap(window.Building, "startDoorModifier", "DOOR_START");
            this.wrap(window.Building, "confirmDoorModifier", "DOOR_CONFIRM");
            this.wrap(window.Weapons, "setLinkMode", "LINK_TOGGLE");
            this.wrap(window.Weapons, "linkDoorToWeapon", "LINK_CREATE");
            // No pointer listeners and no wrappers around pointermove/pointerdown.
        }
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => D.init(), { once: true });
    } else {
        D.init();
    }
})();
