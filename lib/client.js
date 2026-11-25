window.__ModuleLoader__.load({
	id: "dsh-loadout-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		// \0dsh-loadout-manager-css:/home/st/Projects/dsh-plugins/dsh-loadout-manager/src/client/Loadout.module.css.mjs
		const css = ".dshlo_page_LKfmcq{--inset:clamp(24px, 4vw, 48px);box-sizing:border-box;height:100%;padding:0 var(--inset) 48px;color:var(--dsw-alias-label-primary);flex-direction:column;align-items:center;display:flex;overflow:hidden auto}@media (width<=767px){.dshlo_page_LKfmcq{--inset:20px}}.dshlo_page_LKfmcq :is(button:not(.dshlo_tab_LKfmcq),select):focus-visible{outline:var(--dsw-focus-ring-width) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}.dshlo_head_LKfmcq{z-index:2;width:calc(100% + 2 * var(--inset));margin-inline:calc(-1 * var(--inset));box-sizing:border-box;padding:28px var(--inset) 16px;background:var(--dsw-alias-bg-base);flex:none;justify-content:center;display:flex;position:sticky;top:0}html[data-platform=darwin] .dshlo_head_LKfmcq{padding-top:calc(28px + var(--dsh-frame-top-clearance,0px))}.dshlo_headInner_LKfmcq{flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:16px;width:100%;max-width:960px;display:flex}.dshlo_heading_LKfmcq{flex:320px;min-width:0;max-width:100%}.dshlo_title_LKfmcq{margin:0;font-size:20px;font-weight:500;line-height:28px}.dshlo_intro_LKfmcq{color:var(--dsw-alias-label-secondary);margin:4px 0 0;font-size:13px;line-height:20px}.dshlo_scopeMeta_LKfmcq{min-height:18px;color:var(--dsw-alias-label-tertiary);flex-wrap:wrap;gap:0 16px;margin-top:4px;font-size:12px;line-height:18px;display:flex}.dshlo_scopeMeta_LKfmcq code{font-family:var(--ds-font-family-code);overflow-wrap:anywhere;font-size:11.5px}.dshlo_headTabs_LKfmcq{flex:100%;display:flex}.dshlo_toolbar_LKfmcq{flex:0 auto;align-items:center;gap:8px;min-width:0;max-width:100%;display:flex}.dshlo_select_LKfmcq{min-width:0;max-width:100%;color:var(--dsw-alias-label-secondary);display:inline-flex;position:relative}.dshlo_select_LKfmcq svg{pointer-events:none;position:absolute;top:50%;transform:translateY(-50%)}.dshlo_lead_LKfmcq{left:12px}.dshlo_chevron_LKfmcq{right:10px}.dshlo_picker_LKfmcq{box-sizing:border-box;border-radius:var(--dsw-radius-md);min-width:200px;max-width:360px;height:32px;box-shadow:inset 0 0 0 var(--dsh-hairline-width,.5px) var(--dsh-button-outline-color,var(--dsw-alias-border-l3));color:var(--dsw-alias-label-primary);font:inherit;text-overflow:ellipsis;white-space:nowrap;appearance:none;cursor:pointer;background:0 0;border:0;padding:0 30px 0 31px;font-size:13px;line-height:20px;overflow:hidden}.dshlo_picker_LKfmcq option{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-overlay)}.dshlo_picker_LKfmcq:disabled{opacity:.4;cursor:not-allowed}.dshlo_tabs_LKfmcq{--tabs-inset:2px;width:fit-content;min-width:240px;padding:var(--tabs-inset);border-radius:calc(var(--dsw-radius-md) + var(--tabs-inset));background:var(--dsw-alias-bg-module-platform);display:grid;position:relative}.dshlo_tabIndicator_LKfmcq{inset:var(--tabs-inset) auto var(--tabs-inset) var(--tabs-inset);box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);pointer-events:none;transition:transform .18s;position:absolute}.dshlo_tab_LKfmcq{border-radius:var(--dsw-radius-md);height:30px;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;border:0;justify-content:center;align-items:center;gap:6px;padding:0 12px;font-size:14px;line-height:20px;transition:color .18s;display:inline-flex;position:relative}.dshlo_tab_LKfmcq[aria-selected=true]{color:var(--dsw-alias-label-primary);font-weight:500}.dshlo_tab_LKfmcq:focus-visible{text-underline-offset:4px;outline:none;text-decoration:underline 1px}.dshlo_count_LKfmcq{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400}.dshlo_body_LKfmcq{flex:none;width:100%;max-width:960px;padding-top:16px}.dshlo_tabpanel_LKfmcq{flex-direction:column;gap:28px;display:flex}.dshlo_part_LKfmcq{flex-direction:column;gap:16px;display:flex}.dshlo_part_LKfmcq+.dshlo_part_LKfmcq{border-top:.5px solid var(--dsw-alias-border-l2);padding-top:28px}.dshlo_partHead_LKfmcq{align-items:baseline;gap:8px;display:flex}.dshlo_partTitle_LKfmcq{color:var(--dsw-alias-label-primary);margin:0;font-size:16px;font-weight:600;line-height:24px}.dshlo_group_LKfmcq{flex-direction:column;gap:8px;display:flex}.dshlo_groupHead_LKfmcq{align-items:baseline;gap:8px;padding:0 2px;display:flex}.dshlo_groupTitle_LKfmcq{color:var(--dsw-alias-label-primary);margin:0;font-size:14px;font-weight:500;line-height:22px}.dshlo_groupCount_LKfmcq{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}.dshlo_list_LKfmcq{border:.5px solid var(--dsw-alias-settings-card-stroke);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-settings-card-fill);flex-direction:column;padding:0 16px;display:flex}.dshlo_row_LKfmcq{border-bottom:.5px solid var(--dsw-alias-border-l2);flex-direction:column;gap:8px;padding:12px 0;display:flex}.dshlo_row_LKfmcq:last-child{border-bottom:0}.dshlo_rowLine_LKfmcq{align-items:center;gap:16px;display:flex}.dshlo_rowMain_LKfmcq{flex-direction:column;flex:1;gap:2px;min-width:0;display:flex}.dshlo_name_LKfmcq{flex-wrap:wrap;align-items:center;gap:6px;font-size:13.5px;font-weight:500;line-height:20px;display:flex}.dshlo_row_LKfmcq[data-state=off] .dshlo_name_LKfmcq,.dshlo_row_LKfmcq[data-overridden=true] .dshlo_name_LKfmcq{color:var(--dsw-alias-label-secondary)}.dshlo_desc_LKfmcq{color:var(--dsw-alias-label-tertiary);-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:12px;line-height:18px;display:-webkit-box;overflow:hidden}.dshlo_mono_LKfmcq{font-family:var(--ds-font-family-code);color:var(--dsw-alias-label-tertiary);overflow-wrap:anywhere;font-size:11.5px;line-height:16px}.dshlo_version_LKfmcq{font-family:var(--ds-font-family-code);color:var(--dsw-alias-label-tertiary);font-size:11.5px;font-weight:400;line-height:16px}.dshlo_note_LKfmcq{color:var(--dsw-alias-label-secondary);margin:0 0 -12px;font-size:13px;line-height:20px}.dshlo_mcpStatus_LKfmcq{color:var(--dsw-alias-label-secondary);align-items:center;gap:6px;font-size:12px;font-weight:400;line-height:18px;display:inline-flex}.dshlo_mcpStatus_LKfmcq:before{content:\"\";background:var(--dsw-alias-state-idle-primary);border-radius:50%;width:7px;height:7px}.dshlo_mcpStatus_LKfmcq[data-tone=ok]:before{background:var(--dsw-alias-state-success-primary)}.dshlo_mcpStatus_LKfmcq[data-tone=busy]:before{background:var(--dsw-alias-state-warn-primary)}.dshlo_mcpStatus_LKfmcq[data-tone=bad]:before{background:var(--dsw-alias-state-error-primary)}.dshlo_toolList_LKfmcq{border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);flex-direction:column;gap:6px;margin:0;padding:8px 12px;list-style:none;display:flex}.dshlo_tool_LKfmcq{flex-direction:column;gap:1px;min-width:0;display:flex}.dshlo_toolName_LKfmcq{font-family:var(--ds-font-family-code);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px}.dshlo_toolDesc_LKfmcq{color:var(--dsw-alias-label-tertiary);-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:12px;line-height:18px;display:-webkit-box;overflow:hidden}.dshlo_probe_LKfmcq{border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);flex-direction:column;gap:4px;padding:8px 12px;font-size:13px;line-height:20px;display:flex}.dshlo_badge_LKfmcq{border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary);padding:0 6px;font-size:11px;font-weight:400;line-height:16px}.dshlo_controls_LKfmcq{flex-shrink:0;align-items:center;gap:8px;display:flex}.dshlo_seg_LKfmcq{border-radius:calc(var(--dsw-radius-sm) + 2px);background:var(--dsw-alias-bg-module-platform);gap:0;padding:2px;display:inline-flex}.dshlo_seg_LKfmcq button{box-sizing:border-box;border-radius:var(--dsw-radius-sm);height:24px;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;border:.5px solid #0000;padding:0 10px;font-size:12px;line-height:18px}.dshlo_seg_LKfmcq button[aria-checked=true]{background:var(--dsw-alias-bg-layer-3);border-color:var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary);font-weight:500}.dshlo_seg_LKfmcq button:disabled{cursor:not-allowed;opacity:.4}.dshlo_switch_LKfmcq{box-sizing:border-box;background:var(--dsw-alias-border-l3);cursor:pointer;border:0;border-radius:999px;flex-shrink:0;width:36px;height:20px;padding:2px}.dshlo_switch_LKfmcq[aria-checked=true]{background:var(--dsw-alias-brand-primary)}.dshlo_switch_LKfmcq:after{content:\"\";background:var(--dsw-alias-switch-thumb);border-radius:50%;width:16px;height:16px;transition:transform .12s;display:block}.dshlo_switch_LKfmcq[aria-checked=true]:after{background:var(--dsw-alias-label-primary-foreground);transform:translate(16px)}.dshlo_switch_LKfmcq:disabled{cursor:not-allowed;opacity:.4}.dshlo_fixed_LKfmcq{border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);height:24px;color:var(--dsw-alias-label-secondary);white-space:nowrap;cursor:default;align-items:center;padding:0 10px;font-size:12px;line-height:18px;display:inline-flex}.dshlo_btn_LKfmcq{box-sizing:border-box;border-radius:var(--dsw-radius-sm);height:28px;color:var(--dsw-alias-label-secondary);font:inherit;cursor:pointer;background:0 0;border:0;justify-content:center;align-items:center;gap:4px;padding:0 10px;font-size:12px;line-height:18px;display:inline-flex}.dshlo_btn_LKfmcq:disabled{cursor:not-allowed;opacity:.4}.dshlo_btn_LKfmcq[data-tone=outline]{color:var(--dsw-alias-label-primary);box-shadow:inset 0 0 0 var(--dsh-hairline-width,.5px) var(--dsh-button-outline-color,var(--dsw-alias-border-l3))}.dshlo_btn_LKfmcq[data-tone=danger]{color:var(--dsw-alias-state-error-primary);width:28px;padding:0}.dshlo_btn_LKfmcq[data-tone=primary]{background:var(--dsw-alias-state-error-primary);color:var(--dsw-alias-label-primary-foreground)}@media (hover:hover){.dshlo_tab_LKfmcq:hover{color:var(--dsw-alias-label-primary)}.dshlo_picker_LKfmcq:not(:disabled):hover,.dshlo_btn_LKfmcq:not(:disabled):hover,.dshlo_seg_LKfmcq button:not(:disabled):not([aria-checked=true]):hover{background:var(--dsw-alias-interactive-bg-hover)}.dshlo_btn_LKfmcq[data-tone=danger]:not(:disabled):hover{background:var(--dsw-alias-interactive-bg-hover-danger)}.dshlo_btn_LKfmcq[data-tone=primary]:not(:disabled):hover{background:var(--dsw-alias-state-error-primary);opacity:.9}}@media (prefers-reduced-motion:reduce){.dshlo_tabIndicator_LKfmcq,.dshlo_tab_LKfmcq,.dshlo_switch_LKfmcq:after{transition:none}}.dshlo_confirm_LKfmcq{color:var(--dsw-alias-label-secondary);justify-content:flex-end;align-items:center;gap:8px;font-size:13px;line-height:20px;display:flex}.dshlo_error_LKfmcq{color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere;font-size:13px;line-height:20px}.dshlo_error_LKfmcq:has(button){align-items:center;gap:10px;display:flex}.dshlo_empty_LKfmcq{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}.dshlo_preview_LKfmcq{border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);max-height:260px;font-family:var(--ds-font-family-code);white-space:pre-wrap;overflow-wrap:anywhere;margin:0;padding:10px 12px;font-size:12px;line-height:18px;overflow:auto}";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"dsh-loadout-manager/Loadout.module.css\"]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-loadout-manager";
			tag.dataset.pluginCss = "dsh-loadout-manager/Loadout.module.css";
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var Loadout_module_css_default = {
			"name": "dshlo_name_LKfmcq",
			"toolDesc": "dshlo_toolDesc_LKfmcq",
			"btn": "dshlo_btn_LKfmcq",
			"page": "dshlo_page_LKfmcq",
			"part": "dshlo_part_LKfmcq",
			"intro": "dshlo_intro_LKfmcq",
			"toolName": "dshlo_toolName_LKfmcq",
			"headInner": "dshlo_headInner_LKfmcq",
			"empty": "dshlo_empty_LKfmcq",
			"badge": "dshlo_badge_LKfmcq",
			"note": "dshlo_note_LKfmcq",
			"mcpStatus": "dshlo_mcpStatus_LKfmcq",
			"headTabs": "dshlo_headTabs_LKfmcq",
			"error": "dshlo_error_LKfmcq",
			"heading": "dshlo_heading_LKfmcq",
			"scopeMeta": "dshlo_scopeMeta_LKfmcq",
			"desc": "dshlo_desc_LKfmcq",
			"chevron": "dshlo_chevron_LKfmcq",
			"lead": "dshlo_lead_LKfmcq",
			"fixed": "dshlo_fixed_LKfmcq",
			"partHead": "dshlo_partHead_LKfmcq",
			"controls": "dshlo_controls_LKfmcq",
			"toolbar": "dshlo_toolbar_LKfmcq",
			"groupTitle": "dshlo_groupTitle_LKfmcq",
			"groupCount": "dshlo_groupCount_LKfmcq",
			"tabs": "dshlo_tabs_LKfmcq",
			"partTitle": "dshlo_partTitle_LKfmcq",
			"toolList": "dshlo_toolList_LKfmcq",
			"picker": "dshlo_picker_LKfmcq",
			"mono": "dshlo_mono_LKfmcq",
			"tab": "dshlo_tab_LKfmcq",
			"head": "dshlo_head_LKfmcq",
			"version": "dshlo_version_LKfmcq",
			"confirm": "dshlo_confirm_LKfmcq",
			"body": "dshlo_body_LKfmcq",
			"tabIndicator": "dshlo_tabIndicator_LKfmcq",
			"rowLine": "dshlo_rowLine_LKfmcq",
			"select": "dshlo_select_LKfmcq",
			"row": "dshlo_row_LKfmcq",
			"tool": "dshlo_tool_LKfmcq",
			"seg": "dshlo_seg_LKfmcq",
			"group": "dshlo_group_LKfmcq",
			"switch": "dshlo_switch_LKfmcq",
			"preview": "dshlo_preview_LKfmcq",
			"probe": "dshlo_probe_LKfmcq",
			"title": "dshlo_title_LKfmcq",
			"count": "dshlo_count_LKfmcq",
			"tabpanel": "dshlo_tabpanel_LKfmcq",
			"list": "dshlo_list_LKfmcq",
			"groupHead": "dshlo_groupHead_LKfmcq",
			"rowMain": "dshlo_rowMain_LKfmcq"
		};
		// src/client/controls.tsx
		const SKILL_STATES = [
			"on",
			"manual",
			"off"
		];
		/** Three-state skill switch, styled as small SegmentedTabs. */
		function SkillStateControl({ t, value, fileManual, disabled, onChange }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: Loadout_module_css_default.seg,
				role: "radiogroup",
				"aria-label": t("skills"),
				children: SKILL_STATES.map((state) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					role: "radio",
					"aria-checked": value === state,
					title: state === "on" && fileManual ? t("fileManual") : t(`stateHint.${state}`),
					disabled: disabled || state === "on" && fileManual,
					onClick: () => {
						if (value !== state) onChange(state);
					},
					children: t(`state.${state}`)
				}, state))
			});
		}
		/** Switch with the Switch primitive's markup (`role="switch"`, `aria-checked`); `label` names it, the rule wording by default. */
		function Switch({ t, checked, disabled, label, onChange }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				role: "switch",
				className: Loadout_module_css_default.switch,
				"aria-checked": checked,
				"aria-label": label ?? (checked ? t("ruleOn") : t("ruleOff")),
				title: label,
				disabled,
				onClick: () => {
					onChange(!checked);
				}
			});
		}
		const iconProps = {
			fill: "none",
			stroke: "currentColor",
			strokeWidth: 1.3,
			strokeLinecap: "round",
			strokeLinejoin: "round",
			"aria-hidden": true
		};
		function TrashIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: 14,
				height: 14,
				viewBox: "0 0 16 16",
				...iconProps,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M2.5 4.5h11M6.5 4.5V3h3v1.5M4 4.5l.7 8.6a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-8.6M6.7 7v4.5M9.3 7v4.5" })
			});
		}
		/** Globe for the global scope, folder for a workspace. */
		function ScopeIcon({ global }) {
			return global ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				className: Loadout_module_css_default.lead,
				width: 13,
				height: 13,
				viewBox: "0 0 16 16",
				...iconProps,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: 8,
					cy: 8,
					r: 6
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M2 8h12M8 2c1.7 1.8 2.5 3.8 2.5 6S9.7 12.2 8 14M8 2C6.3 3.8 5.5 5.8 5.5 8s.8 4.2 2.5 6" })]
			}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				className: Loadout_module_css_default.lead,
				width: 13,
				height: 13,
				viewBox: "0 0 16 16",
				...iconProps,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 1.5h4.5A1.5 1.5 0 0 1 14 6v5.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7Z" })
			});
		}
		function ChevronIcon() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				className: Loadout_module_css_default.chevron,
				width: 12,
				height: 12,
				viewBox: "0 0 12 12",
				...iconProps,
				strokeWidth: 1.4,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3 4.5 6 7.5l3-3" })
			});
		}
		/** The sidebar entry glyph: a backpack, matching the plugin icon. */
		function LoadoutIcon({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				...iconProps,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M6.5 3.5V3a1.5 1.5 0 0 1 3 0v.5" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
						x: 3,
						y: 3.5,
						width: 10,
						height: 10.5,
						rx: 3
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3 7.5c1.5.8 3.2 1.2 5 1.2s3.5-.4 5-1.2" }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
						x: 5.5,
						y: 10,
						width: 5,
						height: 2.5,
						rx: .8
					})
				]
			});
		}
		// src/shared/api.ts
		/** Absolute route path of an operation. */
		const routePath = (op) => `/api/dsh-loadout-manager/${op}`;
		// src/client/api.ts
		/**
		* POST one operation. The URL is relative to the document base without a
		* leading slash, so it also works behind a reverse-proxy prefix and in the
		* Desktop shell.
		* @throws with the Host's message when the operation fails
		*/
		async function call(op, body) {
			const response = await fetch(new URL(routePath(op).slice(1), document.baseURI), {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body)
			});
			let data;
			try {
				data = await response.json();
			} catch {
				throw new Error(`HTTP ${response.status}`);
			}
			if (!data.ok) throw new Error(data.error.message);
			return data.value;
		}
		function messageOf(error) {
			return error instanceof Error ? error.message : String(error);
		}
		/** `localStorage` that never throws: without storage the choice lasts for this page only. */
		const stored = {
			read(key) {
				try {
					return window.localStorage.getItem(key) ?? void 0;
				} catch {
					return;
				}
			},
			write(key, value) {
				try {
					window.localStorage.setItem(key, value);
				} catch {}
			}
		};
		// src/client/mcp.tsx
		/** One MCP server row: status, switch, tools, check, and restart. */
		function toneOf(status) {
			switch (status.state) {
				case "connected": return "ok";
				case "connecting":
				case "reconnecting": return "busy";
				case "failed":
				case "waiting-credentials": return "bad";
				case "closed":
				case "disabled": return "idle";
			}
		}
		function statusLabel(t, status) {
			switch (status.state) {
				case "connected": return t("mcpState.connected", { count: status.toolCount });
				case "reconnecting": return t("mcpState.reconnecting", {
					attempt: status.attempt,
					max: status.maxAttempts
				});
				default: return t(`mcpState.${status.state}`);
			}
		}
		/** Servers still settling: the page re-reads them until they connect or fail. */
		function isSettling(server) {
			return server.enabled && (server.status.state === "connecting" || server.status.state === "reconnecting");
		}
		function McpRow({ t, scope, locked, reload, server }) {
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(void 0);
			const [showTools, setShowTools] = (0, react.useState)(false);
			const [probe, setProbe] = (0, react.useState)(void 0);
			const project = scope.level === "project";
			const { status } = server;
			const statusError = "error" in status ? status.error : void 0;
			const run = async (operation) => {
				setBusy(true);
				setError(void 0);
				try {
					await operation();
					await reload();
				} catch (failure) {
					setError(messageOf(failure));
				} finally {
					setBusy(false);
				}
			};
			const onProbe = async () => {
				setProbe("running");
				setError(void 0);
				try {
					setProbe(await call("mcp-probe", { name: server.name }));
				} catch (failure) {
					setProbe(void 0);
					setError(messageOf(failure));
				}
			};
			const checked = project ? server.hidden !== true : server.enabled;
			const switchable = project || server.source === "profile";
			const target = scope.workspacePath === void 0 ? {} : { workspacePath: scope.workspacePath };
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: Loadout_module_css_default.row,
				"data-state": checked && server.enabled ? "on" : "off",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Loadout_module_css_default.rowLine,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: Loadout_module_css_default.rowMain,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: Loadout_module_css_default.name,
									children: [
										server.name,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: Loadout_module_css_default.mcpStatus,
											"data-tone": toneOf(status),
											children: statusLabel(t, status)
										}),
										server.transport !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: Loadout_module_css_default.badge,
											children: server.transport
										}) : null
									]
								}),
								server.endpoint !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: Loadout_module_css_default.mono,
									title: server.endpoint,
									children: server.endpoint
								}) : null,
								server.source === "plugin" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: Loadout_module_css_default.desc,
									children: t("mcpPluginOwned")
								}) : null,
								project && !server.enabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: Loadout_module_css_default.desc,
									children: t("mcpOffGlobally")
								}) : null,
								statusError !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: Loadout_module_css_default.error,
									children: statusError
								}) : null
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: Loadout_module_css_default.controls,
							children: [
								server.tools.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: Loadout_module_css_default.btn,
									"aria-expanded": showTools,
									onClick: () => {
										setShowTools(!showTools);
									},
									children: t("mcpTools", { count: server.tools.length })
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: Loadout_module_css_default.btn,
									disabled: probe === "running",
									onClick: () => {
										onProbe();
									},
									children: probe === "running" ? t("mcpProbing") : t("mcpProbe")
								}),
								!project && server.enabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: Loadout_module_css_default.btn,
									disabled: busy,
									onClick: () => {
										run(() => call("mcp-restart", { name: server.name }));
									},
									children: t("mcpRestart")
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
									t,
									checked,
									label: project ? checked ? t("mcpUsedHere") : t("mcpHiddenHere") : checked ? t("mcpServerOn") : t("mcpServerOff"),
									disabled: busy || locked || !switchable,
									onChange: (enabled) => {
										run(() => call("mcp-set", {
											...target,
											name: server.name,
											enabled
										}));
									}
								})
							]
						})]
					}),
					error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: Loadout_module_css_default.error,
						role: "alert",
						children: error
					}) : null,
					showTools ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: Loadout_module_css_default.toolList,
						children: server.tools.map((tool) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
							className: Loadout_module_css_default.tool,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: Loadout_module_css_default.toolName,
								children: tool.title
							}), tool.description !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: Loadout_module_css_default.toolDesc,
								title: tool.description,
								children: tool.description
							}) : null]
						}, tool.name))
					}) : null,
					probe !== void 0 && probe !== "running" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ProbeResult, {
						t,
						probe
					}) : null
				]
			});
		}
		function ProbeResult({ t, probe }) {
			if (!probe.ok) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: Loadout_module_css_default.error,
				role: "status",
				children: t("mcpProbeFailed", {
					stage: probe.stage,
					message: probe.message
				})
			});
			const server = [probe.serverName, probe.serverVersion].filter(Boolean).join(" ") || t("mcpProbeServer");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: Loadout_module_css_default.probe,
				role: "status",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: t("mcpProbeOk", {
						server,
						ms: probe.durationMs,
						count: probe.tools.length
					}) }),
					probe.tools.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: Loadout_module_css_default.mono,
						children: probe.tools.join(", ")
					}) : null,
					probe.truncated ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: Loadout_module_css_default.empty,
						children: t("mcpProbeTruncated")
					}) : null
				]
			});
		}
		// src/client/items.tsx
		/** Tabs, rows, and grouped sections of the Loadout Manager page. */
		/**
		* Tabs. Each lists sections built from the Host state; the instructions tab
		* shows AGENTS.md files before rules, the order they take in the agent's
		* context. A new kind is one more entry here and one more list in the
		* shared contract.
		*/
		const KINDS = [
			{
				id: "skills",
				label: "skills",
				sections: (t, group) => [{
					kind: "skill",
					items: group.skills,
					empty: t("noSkills")
				}]
			},
			{
				id: "rules",
				label: "instructionsTab",
				sections: (t, group, { level, rulesHint }) => [{
					kind: "instruction",
					title: t("instructionFiles"),
					items: group.instructions,
					empty: t(level === "global" ? "noGlobalInstructions" : "noProjectInstructions")
				}, {
					kind: "rule",
					title: t("rules"),
					items: group.rules,
					empty: t("noRules", { path: rulesHint })
				}]
			},
			{
				id: "mcp",
				label: "mcpTab",
				sections: (t, group, { level, loadoutPath }) => [{
					kind: "mcp",
					items: group.mcp ?? [],
					note: level === "global" ? t("mcpNoteGlobal") : t("mcpNoteProject", { path: loadoutPath }),
					empty: group.mcp === void 0 ? t("mcpUnavailable") : t("noMcp")
				}]
			}
		];
		function countOf(kind, group) {
			return kind.sections((key) => key, group, {
				level: "global",
				rulesHint: "",
				loadoutPath: ""
			}).reduce((sum, section) => sum + section.items.length, 0);
		}
		function Tabs({ t, value, counts, onChange }) {
			const index = Math.max(0, KINDS.findIndex((kind) => kind.id === value));
			const onKeyDown = (event, at) => {
				const last = KINDS.length - 1;
				const next = {
					ArrowLeft: at === 0 ? last : at - 1,
					ArrowRight: at === last ? 0 : at + 1,
					Home: 0,
					End: last
				}[event.key];
				const target = next === void 0 ? void 0 : KINDS[next];
				if (next === void 0 || target === void 0) return;
				event.preventDefault();
				event.currentTarget.parentElement?.querySelectorAll("[role=\"tab\"]").item(next).focus();
				onChange(target.id);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: Loadout_module_css_default.tabs,
				role: "tablist",
				"aria-label": t("tabs"),
				style: { gridTemplateColumns: `repeat(${KINDS.length}, minmax(0, 1fr))` },
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: Loadout_module_css_default.tabIndicator,
					"aria-hidden": true,
					style: {
						width: `calc((100% - 4px) / ${KINDS.length})`,
						transform: `translateX(${index * 100}%)`
					}
				}), KINDS.map((kind, at) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					role: "tab",
					id: `dshlo-tab-${kind.id}`,
					className: Loadout_module_css_default.tab,
					"aria-selected": kind.id === value,
					"aria-controls": "dshlo-tabpanel",
					tabIndex: kind.id === value ? 0 : -1,
					onClick: () => {
						onChange(kind.id);
					},
					onKeyDown: (event) => {
						onKeyDown(event, at);
					},
					children: [t(kind.label), counts[kind.id] === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: Loadout_module_css_default.count,
						children: counts[kind.id]
					})]
				}, kind.id))]
			});
		}
		function Row({ t, scope, locked, reload, entry }) {
			const [busy, setBusy] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(void 0);
			const [confirming, setConfirming] = (0, react.useState)(false);
			const [preview, setPreview] = (0, react.useState)(void 0);
			const target = scope.workspacePath === void 0 ? {} : { workspacePath: scope.workspacePath };
			const { kind, item } = entry;
			const run = (0, react.useCallback)(async (operation) => {
				setBusy(true);
				setError(void 0);
				try {
					await operation();
					await reload();
				} catch (failure) {
					setError(messageOf(failure));
				} finally {
					setBusy(false);
				}
			}, [reload]);
			const onOpen = async () => {
				if (preview !== void 0) {
					setPreview(void 0);
					return;
				}
				setError(void 0);
				try {
					setPreview(await call("read", {
						...target,
						path: item.file
					}));
				} catch (failure) {
					setError(messageOf(failure));
				}
			};
			let control;
			if (entry.kind === "instruction") control = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: Loadout_module_css_default.fixed,
				title: t("alwaysLoadedHint"),
				children: t("alwaysLoaded")
			});
			else if (entry.kind === "skill") {
				const skill = entry.item;
				control = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillStateControl, {
					t,
					value: skill.state,
					fileManual: skill.fileManual,
					disabled: busy || locked,
					onChange: (state) => {
						run(() => call("set-skill", {
							...target,
							level: scope.level,
							name: skill.name,
							state
						}));
					}
				});
			} else {
				const rule = entry.item;
				control = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Switch, {
					t,
					checked: rule.enabled,
					disabled: busy || locked,
					onChange: (enabled) => {
						run(() => call("set-rule", {
							...target,
							id: rule.id,
							enabled
						}));
					}
				});
			}
			const skill = entry.kind === "skill" ? entry.item : void 0;
			const deletable = entry.kind === "rule" || skill !== void 0 && !skill.readOnly;
			const deletePath = skill?.entry ?? item.file;
			const description = entry.kind === "instruction" ? void 0 : entry.item.description;
			const state = skill?.state ?? (entry.kind === "rule" && !entry.item.enabled ? "off" : "on");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: Loadout_module_css_default.row,
				"data-state": state,
				"data-overridden": skill?.overriddenBy !== void 0,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Loadout_module_css_default.rowLine,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: Loadout_module_css_default.rowMain,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: Loadout_module_css_default.name,
									children: [
										item.name,
										skill?.version !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: Loadout_module_css_default.version,
											title: t("version", { version: skill.version }),
											children: versionTag(skill.version)
										}) : null,
										skill?.readOnly === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: Loadout_module_css_default.badge,
											children: t("builtIn")
										}) : null
									]
								}),
								description ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: Loadout_module_css_default.desc,
									title: description,
									children: description
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: Loadout_module_css_default.mono,
									children: item.file
								}),
								skill?.overriddenBy !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: Loadout_module_css_default.mono,
									children: t("overridden", { path: skill.overriddenBy })
								}) : null
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: Loadout_module_css_default.controls,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: Loadout_module_css_default.btn,
									"aria-expanded": preview !== void 0,
									onClick: () => {
										onOpen();
									},
									children: preview === void 0 ? t("open") : t("hide")
								}),
								deletable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: Loadout_module_css_default.btn,
									"data-tone": "danger",
									"aria-label": t("delete"),
									title: t("delete"),
									disabled: busy || confirming,
									onClick: () => {
										setConfirming(true);
									},
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TrashIcon, {})
								}) : null,
								control
							]
						})]
					}),
					confirming ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Loadout_module_css_default.confirm,
						children: [
							t("confirmDelete"),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: Loadout_module_css_default.btn,
								"data-tone": "outline",
								onClick: () => {
									setConfirming(false);
								},
								children: t("cancel")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: Loadout_module_css_default.btn,
								"data-tone": "primary",
								disabled: busy,
								onClick: () => {
									run(async () => {
										await call("remove", {
											...target,
											path: deletePath
										});
										setConfirming(false);
									});
								},
								children: t("confirm")
							})
						]
					}) : null,
					error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: Loadout_module_css_default.error,
						role: "alert",
						children: error
					}) : null,
					preview !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						className: Loadout_module_css_default.preview,
						children: preview.text
					}), preview.truncated ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: Loadout_module_css_default.empty,
						children: t("truncated")
					}) : null] }) : null
				]
			});
		}
		/** `3.0.0` → `v3.0.0`; a version that does not start with a digit is shown as written. */
		function versionTag(version) {
			return /^\d/.test(version) ? `v${version}` : version;
		}
		/** Group heading: a skill or rule source, the folder an instruction file sits in, or who owns an MCP server. */
		function groupTitle(t, entry) {
			switch (entry.kind) {
				case "mcp": return t(`mcpSource.${entry.item.source}`);
				case "skill": return t(`source.${entry.item.source}`);
				case "rule": return t(`source.${entry.item.source}`);
				case "instruction": {
					const { location } = entry.item;
					if (location === "dsh" || location === "agents") return t(`location.${location}`);
					return location === "." ? t("projectRoot") : location;
				}
			}
		}
		function groupKey(entry) {
			return entry.kind === "instruction" ? entry.item.location : entry.item.source;
		}
		function entryKey(entry) {
			return entry.kind === "mcp" ? `mcp:${entry.item.name}` : entry.item.file;
		}
		function entriesOf(section) {
			switch (section.kind) {
				case "mcp": return section.items.map((item) => ({
					kind: "mcp",
					item
				}));
				case "skill": return section.items.map((item) => ({
					kind: "skill",
					item
				}));
				case "rule": return section.items.map((item) => ({
					kind: "rule",
					item
				}));
				case "instruction": return section.items.map((item) => ({
					kind: "instruction",
					item
				}));
			}
		}
		function Groups({ section, ...rowProps }) {
			const groups = /* @__PURE__ */ new Map();
			for (const entry of entriesOf(section)) {
				const key = groupKey(entry);
				groups.set(key, [...groups.get(key) ?? [], entry]);
			}
			return [...groups].map(([key, entries]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: Loadout_module_css_default.group,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: Loadout_module_css_default.groupHead,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: Loadout_module_css_default.groupTitle,
						children: entries[0] === void 0 ? key : groupTitle(rowProps.t, entries[0])
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: Loadout_module_css_default.groupCount,
						children: entries.length
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: Loadout_module_css_default.list,
					children: entries.map((entry) => entry.kind === "mcp" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(McpRow, {
						server: entry.item,
						...rowProps
					}, entryKey(entry)) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
						entry,
						...rowProps
					}, entryKey(entry)))
				})]
			}, `${section.kind}:${key}`));
		}
		/**
		* A tab's sections in order. A titled section is a heading over its own
		* groups, with its own empty text; an untitled section renders its groups
		* directly.
		*/
		function Sections({ sections, ...rowProps }) {
			return sections.map((section) => {
				const list = section.items.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: Loadout_module_css_default.empty,
					children: section.empty
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Groups, {
					section,
					...rowProps
				});
				const body = section.note === void 0 ? list : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [section.items.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: Loadout_module_css_default.note,
					children: section.note
				}) : null, list] });
				if (section.title === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: Loadout_module_css_default.tabpanel,
					children: body
				}, section.kind);
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: Loadout_module_css_default.part,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Loadout_module_css_default.partHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							className: Loadout_module_css_default.partTitle,
							children: section.title
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: Loadout_module_css_default.groupCount,
							children: section.items.length
						})]
					}), body]
				}, section.kind);
			});
		}
		// src/client/LoadoutPage.tsx
		/** The Loadout Manager page: scope picker, kind tabs, and the selected kind's sections. */
		const SCOPE_KEY = "dsh-loadout-manager.scope";
		const TAB_KEY = "dsh-loadout-manager.tab";
		/** Workspace values are absolute paths, so they never equal this one. */
		const GLOBAL = "global";
		const noWorkspaces = (selector) => selector({ items: [] });
		/** Workspace title, with the path only when another workspace shares the title. */
		function optionLabel(item, all) {
			return all.filter((other) => other.title === item.title).length > 1 ? `${item.title} – ${item.path}` : item.title;
		}
		function LoadoutPage({ t, useWorkspaces = noWorkspaces }) {
			const workspaces = useWorkspaces((snapshot) => snapshot.items);
			const [chosenScope, setChosenScope] = (0, react.useState)(() => stored.read(SCOPE_KEY) ?? GLOBAL);
			const scopeValue = chosenScope !== GLOBAL && workspaces.some((item) => item.path === chosenScope) ? chosenScope : GLOBAL;
			const workspacePath = scopeValue === GLOBAL ? void 0 : scopeValue;
			const [chosenTab, setChosenTab] = (0, react.useState)(() => stored.read(TAB_KEY) ?? KINDS[0]?.id ?? "");
			const kind = KINDS.find((item) => item.id === chosenTab) ?? KINDS[0];
			const [data, setData] = (0, react.useState)(void 0);
			const [error, setError] = (0, react.useState)(void 0);
			const reload = (0, react.useCallback)(async () => {
				try {
					const value = await call("state", workspacePath === void 0 ? {} : { workspacePath });
					setData({
						for: workspacePath,
						value
					});
					setError(void 0);
				} catch (failure) {
					setError(messageOf(failure));
				}
			}, [workspacePath]);
			(0, react.useEffect)(() => {
				reload();
			}, [reload]);
			const settling = kind?.id === "mcp" && (data?.value.global.mcp ?? []).some(isSettling);
			(0, react.useEffect)(() => {
				if (!settling) return void 0;
				const timer = window.setInterval(() => {
					reload();
				}, 2e3);
				return () => {
					window.clearInterval(timer);
				};
			}, [settling, reload]);
			const pickScope = (value) => {
				setChosenScope(value);
				stored.write(SCOPE_KEY, value);
			};
			const pickTab = (value) => {
				setChosenTab(value);
				stored.write(TAB_KEY, value);
			};
			const current = data !== void 0 && data.for === workspacePath ? data.value : void 0;
			const group = current === void 0 ? void 0 : workspacePath === void 0 ? current.global : current.workspace;
			const scope = workspacePath === void 0 ? { level: "global" } : {
				level: "project",
				workspacePath
			};
			const projectRoot = current?.workspace?.projectRoot ?? workspacePath;
			const rulesHint = workspacePath === void 0 ? "~/.agents/rules" : `${projectRoot}/.agents/rules`;
			const locked = group?.error !== void 0;
			const counts = group === void 0 ? {} : Object.fromEntries(KINDS.map((item) => [item.id, countOf(item, group)]));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: Loadout_module_css_default.page,
				"aria-busy": group === void 0 && error === void 0,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("header", {
					className: Loadout_module_css_default.head,
					"data-window-drag": true,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Loadout_module_css_default.headInner,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: Loadout_module_css_default.heading,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", {
										className: Loadout_module_css_default.title,
										children: t("title")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: Loadout_module_css_default.intro,
										children: t("intro")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: Loadout_module_css_default.scopeMeta,
										children: [workspacePath === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: workspaces.length === 0 ? t("noWorkspaces") : t("globalHint") }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: projectRoot }), group !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
											t("savedToLabel"),
											" ",
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: group.loadoutPath })
										] }) : null]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: Loadout_module_css_default.toolbar,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: Loadout_module_css_default.select,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScopeIcon, { global: workspacePath === void 0 }),
										/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
											className: Loadout_module_css_default.picker,
											"aria-label": t("scope"),
											title: workspacePath ?? t("globalHint"),
											value: scopeValue,
											disabled: workspaces.length === 0,
											onChange: (event) => {
												pickScope(event.target.value);
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: GLOBAL,
												children: t("global")
											}), workspaces.map((item) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: item.path,
												children: optionLabel(item, workspaces)
											}, item.workspaceId))]
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ChevronIcon, {})
									]
								})
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: Loadout_module_css_default.headTabs,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Tabs, {
									t,
									value: kind?.id ?? "",
									counts,
									onChange: pickTab
								})
							})
						]
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: Loadout_module_css_default.body,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: Loadout_module_css_default.tabpanel,
						role: "tabpanel",
						id: "dshlo-tabpanel",
						"aria-labelledby": `dshlo-tab-${kind?.id ?? ""}`,
						children: [
							error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: Loadout_module_css_default.error,
								role: "alert",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: error }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: Loadout_module_css_default.btn,
									"data-tone": "outline",
									onClick: () => {
										reload();
									},
									children: t("retry")
								})]
							}) : null,
							group === void 0 && error === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: Loadout_module_css_default.empty,
								role: "status",
								children: t("loading")
							}) : null,
							group?.error !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: Loadout_module_css_default.error,
								role: "alert",
								children: t("malformed", {
									path: group.loadoutPath,
									error: group.error
								})
							}) : null,
							group !== void 0 && kind !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Sections, {
								sections: kind.sections(t, group, {
									level: scope.level,
									rulesHint,
									loadoutPath: group.loadoutPath
								}),
								t,
								scope,
								locked,
								reload
							}, `${scopeValue}:${kind.id}`) : null
						]
					})
				})]
			});
		}
		// src/client/locale.ts
		/**
		* Page copy. English is the source of the key set: every other locale is a
		* `Record<LoadoutKey, string>`, so a missing or extra key fails typecheck.
		* Placeholders use `{name}`, as `ctx.locale` expects.
		*/
		const NS = "loadout";
		const en = {
			nav: "Loadout Manager",
			title: "Loadout Manager",
			intro: "Choose which skills and rules agents carry. Changes apply from the next agent step.",
			global: "Global",
			globalHint: "Skills and rules from ~/.dsh, ~/.agents, and built-in skills",
			scope: "Scope",
			tabs: "Item kinds",
			savedToLabel: "Saved to",
			noWorkspaces: "No workspaces yet. Add one in the sidebar to manage its skills and rules.",
			skills: "Skills",
			noSkills: "No skills here.",
			noRules: "No rule files. Put .md files into {path}.",
			instructionsTab: "Instructions",
			instructionFiles: "Instruction files",
			rules: "Rules",
			noGlobalInstructions: "No AGENTS.md in ~/.dsh or ~/.agents.",
			noProjectInstructions: "No AGENTS.md, CLAUDE.md, or their .local.md variants from the project root down to this workspace.",
			alwaysLoaded: "Always loaded",
			alwaysLoadedHint: "DSH adds this file to the context of every session in this scope. Loadout Manager does not switch it.",
			projectRoot: "Project root",
			"state.on": "On",
			"state.manual": "Manual",
			"state.off": "Off",
			"stateHint.on": "In the model catalog and the / menu",
			"stateHint.manual": "Hidden from the model, still available as /name",
			"stateHint.off": "Hidden everywhere",
			fileManual: "The skill file sets disable-model-invocation, so it cannot be On",
			overridden: "Overridden by {path}",
			builtIn: "Built in",
			version: "Version {version}",
			ruleOn: "Rule is on",
			ruleOff: "Rule is off",
			open: "Open",
			hide: "Hide",
			delete: "Delete",
			confirmDelete: "Move to the trash?",
			cancel: "Cancel",
			confirm: "Move to trash",
			loading: "Loading…",
			retry: "Retry",
			malformed: "{path} is malformed: {error}. Fix the file to change this group.",
			truncated: "Showing the first 256 KB.",
			"source.project-dsh": ".dsh/skills",
			"source.project-agents": ".agents/skills",
			"source.custom": "Custom and built-in",
			"source.user-dsh": "~/.dsh/skills",
			"source.user-agents": "~/.agents/skills",
			"source.dsh": "~/.dsh/rules",
			"source.agents": "~/.agents/rules",
			"source.project": ".agents/rules",
			"location.dsh": "~/.dsh",
			"location.agents": "~/.agents",
			mcpTab: "MCP",
			noMcp: "No MCP servers in this profile. Add them in DSH settings.",
			mcpUnavailable: "This DSH profile has no MCP server manager.",
			mcpNoteGlobal: "The switch starts or stops a server for every workspace and is saved to your DSH profile.",
			mcpNoteProject: "The switch hides or shows a server's tools for agents in this workspace and is saved to {path}.",
			"mcpSource.profile": "Profile servers",
			"mcpSource.plugin": "From plugins",
			"mcpState.connected": "Connected, tools: {count}",
			"mcpState.connecting": "Connecting…",
			"mcpState.reconnecting": "Reconnecting, attempt {attempt} of {max}",
			"mcpState.waiting-credentials": "Waiting for credentials",
			"mcpState.failed": "Failed",
			"mcpState.closed": "Stopped",
			"mcpState.disabled": "Off",
			mcpTools: "Tools ({count})",
			mcpProbe: "Check",
			mcpProbing: "Checking…",
			mcpProbeServer: "The server",
			mcpProbeOk: "{server} answered in {ms} ms, tools: {count}",
			mcpProbeFailed: "Check failed at the {stage} stage: {message}",
			mcpProbeTruncated: "The server has more tools than shown.",
			mcpRestart: "Restart",
			mcpServerOn: "Server is running",
			mcpServerOff: "Server is stopped",
			mcpUsedHere: "Tools are available in this workspace",
			mcpHiddenHere: "Tools are hidden in this workspace",
			mcpPluginOwned: "Registered by a plugin; it runs while that plugin is enabled.",
			mcpOffGlobally: "Stopped globally: switch it on in Global first."
		};
		const ru = {
			nav: "Loadout Manager",
			title: "Loadout Manager",
			intro: "Выберите, какие скиллы и правила берут с собой агенты. Изменения действуют со следующего шага агента.",
			global: "Глобальные",
			globalHint: "Скиллы и правила из ~/.dsh, ~/.agents и встроенные скиллы",
			scope: "Область",
			tabs: "Виды элементов",
			savedToLabel: "Сохраняется в",
			noWorkspaces: "Workspace пока нет. Добавьте его в боковой панели, чтобы управлять его скиллами и правилами.",
			skills: "Скиллы",
			noSkills: "Скиллов нет.",
			noRules: "Файлов правил нет. Положите .md-файлы в {path}.",
			instructionsTab: "Инструкции",
			instructionFiles: "Файлы инструкций",
			rules: "Правила",
			noGlobalInstructions: "В ~/.dsh и ~/.agents нет AGENTS.md.",
			noProjectInstructions: "От корня проекта до этого workspace нет AGENTS.md, CLAUDE.md и их вариантов .local.md.",
			alwaysLoaded: "Всегда загружается",
			alwaysLoadedHint: "DSH добавляет этот файл в контекст каждой сессии этой области. Loadout Manager его не переключает.",
			projectRoot: "Корень проекта",
			"state.on": "Вкл",
			"state.manual": "Вручную",
			"state.off": "Выкл",
			"stateHint.on": "В каталоге модели и в меню /",
			"stateHint.manual": "Модель не видит, но вызывается через /name",
			"stateHint.off": "Скрыт везде",
			fileManual: "В файле скилла стоит disable-model-invocation, поэтому включить его нельзя",
			overridden: "Перекрыт: {path}",
			builtIn: "Встроенный",
			version: "Версия {version}",
			ruleOn: "Правило включено",
			ruleOff: "Правило выключено",
			open: "Открыть",
			hide: "Скрыть",
			delete: "Удалить",
			confirmDelete: "Переместить в корзину?",
			cancel: "Отмена",
			confirm: "В корзину",
			loading: "Загрузка…",
			retry: "Повторить",
			malformed: "{path} повреждён: {error}. Исправьте файл, чтобы менять эту группу.",
			truncated: "Показаны первые 256 КБ.",
			"source.project-dsh": ".dsh/skills",
			"source.project-agents": ".agents/skills",
			"source.custom": "Дополнительные и встроенные",
			"source.user-dsh": "~/.dsh/skills",
			"source.user-agents": "~/.agents/skills",
			"source.dsh": "~/.dsh/rules",
			"source.agents": "~/.agents/rules",
			"source.project": ".agents/rules",
			"location.dsh": "~/.dsh",
			"location.agents": "~/.agents",
			mcpTab: "MCP",
			noMcp: "В профиле нет MCP-серверов. Добавьте их в настройках DSH.",
			mcpUnavailable: "В этом профиле DSH нет менеджера MCP-серверов.",
			mcpNoteGlobal: "Переключатель запускает или останавливает сервер во всех workspace и сохраняется в профиле DSH.",
			mcpNoteProject: "Переключатель скрывает или показывает инструменты сервера агентам этого workspace и сохраняется в {path}.",
			"mcpSource.profile": "Серверы профиля",
			"mcpSource.plugin": "Из плагинов",
			"mcpState.connected": "Подключён, инструментов: {count}",
			"mcpState.connecting": "Подключается…",
			"mcpState.reconnecting": "Переподключение, попытка {attempt} из {max}",
			"mcpState.waiting-credentials": "Ждёт учётные данные",
			"mcpState.failed": "Ошибка",
			"mcpState.closed": "Остановлен",
			"mcpState.disabled": "Выключен",
			mcpTools: "Инструменты ({count})",
			mcpProbe: "Проверить",
			mcpProbing: "Проверка…",
			mcpProbeServer: "Сервер",
			mcpProbeOk: "{server} ответил за {ms} мс, инструментов: {count}",
			mcpProbeFailed: "Проверка не прошла на этапе {stage}: {message}",
			mcpProbeTruncated: "Инструментов у сервера больше, чем показано.",
			mcpRestart: "Перезапустить",
			mcpServerOn: "Сервер запущен",
			mcpServerOff: "Сервер остановлен",
			mcpUsedHere: "Инструменты доступны в этом workspace",
			mcpHiddenHere: "Инструменты скрыты в этом workspace",
			mcpPluginOwned: "Зарегистрирован плагином и работает, пока этот плагин включён.",
			mcpOffGlobally: "Сервер остановлен глобально: сначала включите его в «Глобальных»."
		};
		// src/client/index.tsx
		/** Sidebar entry id and `main` panel key. */
		const PANEL_ID = "loadout";
		const inject = ["slots", "locale"];
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, "en", en), "dsh-loadout-manager: locale en");
			ctx.effect(() => ctx.locale.register(NS, "ru", ru), "dsh-loadout-manager: locale ru");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("main", () => ctx.slots.register({
				name: "main",
				key: PANEL_ID,
				locale: NS
			}, LoadoutPage));
			ctx.slots.inject("sidebar.panellist", () => ctx.slots.register({
				name: "sidebar.panellist",
				id: PANEL_ID,
				order: 20,
				label: () => t("nav"),
				locale: NS
			}, LoadoutIcon));
		}
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
