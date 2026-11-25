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
        pointerState: { lastEvent: null, counts: {}, lastMoveLog: 0, activePointer: null },
        doorDiagnostics() {
            const B = window.Building, G = window.Game, drag = B && B.doorModifierDrag;
            const panel = document.getElementById("door-confirm-actions");
            const rect = panel && panel.getBoundingClientRect();
            return {
                dragExists: !!drag, released: !!(drag && drag.released),
                confirmReady: !!(drag && drag.confirmReady),
                candidateExists: !!(drag && drag.candidate),
                candidateStillInStruts: !!(drag && drag.candidate && B.struts && B.struts.includes(drag.candidate)),
                connectedBeamCount: drag && drag.connected ? drag.connected.length : 0,
                dragWorldPosition: drag ? {x:+drag.x.toFixed(1),y:+drag.y.toFixed(1)} : null,
                confirmPanel: panel ? {
                    hidden:panel.hidden, display:getComputedStyle(panel).display,
                    visibility:getComputedStyle(panel).visibility, opacity:getComputedStyle(panel).opacity,
                    rect:rect?{x:+rect.x.toFixed(1),y:+rect.y.toFixed(1),width:+rect.width.toFixed(1),height:+rect.height.toFixed(1)}:null,
                    parent:panel.parentElement&&panel.parentElement.tagName,
                    buttons:Array.from(panel.querySelectorAll("button")).map(button=>({id:button.id,disabled:button.disabled,rect:(()=>{const r=button.getBoundingClientRect();return{x:+r.x.toFixed(1),y:+r.y.toFixed(1),width:+r.width.toFixed(1),height:+r.height.toFixed(1)}})()}))
                }:{missing:true},
                pointer:this.pointerState
            };
        },

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
                mobileDeselectButton: (() => {
                    const button = document.querySelector('#mobile-controls [data-mobile-action="deselect"]');
                    if (!button) return { exists: false };
                    const r = button.getBoundingClientRect(), css = getComputedStyle(button);
                    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
                    const hit = document.elementFromPoint(cx, cy);
                    return {
                        exists: true, text: button.textContent.trim(),
                        rect: { x: +r.x.toFixed(1), y: +r.y.toFixed(1),
                            width: +r.width.toFixed(1), height: +r.height.toFixed(1) },
                        display: css.display, visibility: css.visibility,
                        pointerEvents: css.pointerEvents, zIndex: css.zIndex,
                        hitTarget: hit ? (hit.id || hit.tagName) : null,
                        hitIsButton: !!(hit && (hit === button || button.contains(hit)))
                    };
                })(),
                linkSource: !!(W && W.linkSource),
                cannons: W && W.cannons && W.cannons.length,
                doors: B && B.struts ? B.struts.filter(s => s.isDoor && !s.removed).length : 0,
                doorDiagnostics: this.doorDiagnostics()
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

        installDoorEventDiagnostics() {
            if (!document.getElementById("gameCanvas") || document.documentElement.dataset.ccDoorDiagnostics) return;
            document.documentElement.dataset.ccDoorDiagnostics = "1";
            const self = this;
            const record = (event) => {
                const state = self.pointerState;
                state.lastEvent = {type:event.type,pointerType:event.pointerType||(event.touches?"touch":"mouse"),pointerId:event.pointerId==null?null:event.pointerId,target:event.target&&(event.target.id||event.target.tagName),clientX:Number.isFinite(event.clientX)?+event.clientX.toFixed(1):null,clientY:Number.isFinite(event.clientY)?+event.clientY.toFixed(1):null,buttons:event.buttons==null?null:event.buttons,time:new Date().toLocaleTimeString()};
                state.counts[event.type]=(state.counts[event.type]||0)+1;
                if(event.type==="pointerdown"||event.type==="touchstart")state.activePointer=state.lastEvent;
                if(["pointerup","touchend","pointercancel","touchcancel"].includes(event.type))state.activePointer=null;
                if(!/move$/.test(event.type)) self.report("INPUT_"+event.type.toUpperCase(),"INFO",event.type+" observed on document.",self.doorDiagnostics());
                else if(window.Building&&window.Building.doorModifierDrag&&Date.now()-state.lastMoveLog>350){state.lastMoveLog=Date.now();self.report("INPUT_MOVE","INFO",event.type+" while door drag active.",self.doorDiagnostics());}
            };
            ["pointerdown","pointerup","pointercancel","pointermove","touchstart","touchend","touchcancel","touchmove"].forEach(type=>document.addEventListener(type,record,{capture:true,passive:true}));
            document.addEventListener("visibilitychange",()=>self.report("PAGE_VISIBILITY","INFO","Visibility: "+document.visibilityState,self.doorDiagnostics()));
            this.report("DOOR_DIAGNOSTICS","PASS","Document-level input and confirmation UI diagnostics installed.");
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
            this.wrap(window.Building, "releaseDoorModifier", "DOOR_RELEASE");
            this.wrap(window.Building, "confirmDoorModifier", "DOOR_CONFIRM");
            this.installDoorEventDiagnostics();
            const confirm = document.getElementById("btn-confirm-door"), cancel = document.getElementById("btn-cancel-door");
            if (confirm) confirm.addEventListener("click", () => this.report("DOOR_CONFIRM_CLICK","INFO","Confirm button clicked.",this.doorDiagnostics()));
            if (cancel) cancel.addEventListener("click", () => this.report("DOOR_CANCEL_CLICK","INFO","Cancel button clicked.",this.doorDiagnostics()));
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
