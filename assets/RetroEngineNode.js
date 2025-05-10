import { app } from "/scripts/app.js";
const POWER_BUTTON = {
    WIDTH: 60,
    HEIGHT: 24,
    MARGIN: 8,
    COLORS: {
        TEXT: "#ffffff"
    }
};
const EXTENSION_BASE_PATH = "/extensions/ComfyUI-RetroEngine";
const EMULATOR_DIALOG = {
    WIDTH: 800,
    HEIGHT: 600,
    BACKGROUND: "rgba(34, 34, 34, 0.9)",
    BORDER: "1px solid #555",
    BORDER_RADIUS: "5px",
    TITLE_HEIGHT: 30,
    SHADOW: "0 4px 23px 5px rgba(0, 0, 0, 0.2), 0 2px 6px rgba(0, 0, 0, 0.15)"
};
const BIOS_REQUIRED = new Set(["PlayStation", "3DO", "SegaSaturn", "SegaCD"]);
function hideWidget(widget) {
    if (widget) {
        widget.type = "hidden";
        widget.computeSize = () => [0, -4];
        widget.draw = () => {};
    }
}
function showWidget(widget, originalWidgetType) {
    if (widget) {
        widget.type = originalWidgetType;
        if (widget.hasOwnProperty('computeSize')) {
            delete widget.computeSize;
        }
        if (widget.hasOwnProperty('draw')) {
            delete widget.draw;
        }
    }
}
async function captureAndSendCanvasAsync(node, timeout = 5000) {
    try {
        const iframe = node.emulatorFrame;
        if (iframe && iframe.contentWindow) {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            const canv = doc.querySelector('canvas');
            if (canv) {
                const dataUrl = canv.toDataURL('image/jpeg', 0.5);
                const screenDataWidget = node.widgets?.find(w => w.name === 'screen_data');
                if (screenDataWidget) {
                    screenDataWidget.value = dataUrl;
                    node.setDirtyCanvas(true, false);
                }
                return dataUrl;
            }
        }
    } catch (e) {
        console.warn(`[Retro Engine Node ${node.id}] Direct capture failed, falling back:`, e);
    }
    return new Promise((resolve, reject) => {
        const iframe = node.emulatorFrame;
        if (!iframe || !iframe.contentWindow) {
            console.error(`[Retro Engine Node ${node.id}] ERROR: Emulator not running or iframe inaccessible.`);
            return reject(new Error('Emulator iframe not found or not accessible.'));
        }
        let handler, timeoutId;
        const cleanup = () => {
            if (handler) window.removeEventListener('message', handler);
            if (timeoutId) clearTimeout(timeoutId);
        };
        handler = function(event) {
            if (event.data?.type === 'canvasCapture') {
                cleanup();
                const imageData = event.data.payload;
                if (!imageData || typeof imageData !== 'string' || !(imageData.startsWith('data:image') || imageData.startsWith('data:application/octet-stream'))) {
                    console.error(`[Retro Engine Node ${node.id}] ERROR: Invalid image data received.`);
                    return reject(new Error('Received invalid image data from emulator.'));
                }
                const screenDataWidget = node.widgets?.find(w => w.name === 'screen_data');
                if (screenDataWidget) {
                    screenDataWidget.value = imageData;
                    node.setDirtyCanvas(true, false);
                    resolve(imageData);
                } else {
                    console.error(`[Retro Engine Node ${node.id}] ERROR: screen_data widget not found.`);
                    reject(new Error('screen_data widget not found on the node.'));
                }
            }
        };
        window.addEventListener('message', handler);
        timeoutId = setTimeout(() => {
            cleanup();
            console.error(`[Retro Engine Node ${node.id}] ERROR: Timeout waiting for canvas data.`);
            reject(new Error(`Timeout (${timeout}ms) waiting for screenshot data.`));
        }, timeout);
        try {
            iframe.contentWindow.postMessage({ type: 'canvasCaptureRequest' }, '*');
        } catch (error) {
            cleanup();
            console.error(`[Retro Engine Node ${node.id}] Error sending postMessage:`, error);
            reject(new Error(`Failed to send capture command: ${error.message || error}`));
        }
    });
}
function makeDraggable(element, handle) {
    let offsetX = 0, offsetY = 0;
    let isDragging = false;
    handle.onmousedown = (e) => {
        e.preventDefault();
        isDragging = true;
        const rect = element.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        document.onmousemove = (e) => {
            if (isDragging) {
                element.style.top = `${e.clientY - offsetY}px`;
                element.style.left = `${e.clientX - offsetX}px`;
            }
        };
        document.onmouseup = () => {
            isDragging = false;
            document.onmousemove = null;
            document.onmouseup = null;
        };
    };
    handle.onmouseup = () => {
        if (isDragging) {
            isDragging = false;
            document.onmousemove = null;
            document.onmouseup = null;
        }
    };
}
function drawRoundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
}
function getPowerButtonColors(isOn, isHovered) {
    if (isOn) {
        return {
            bgColor: isHovered ? "#64B5F6" : "#2196F3",
            borderColor: isHovered ? "#42A5F5" : "#1976D2"
        };
    }
    return {
        bgColor: isHovered ? "#4D4D4D" : "#3D3D3D",
        borderColor: isHovered ? "#777777" : "#555555"
    };
}
app.registerExtension({
    name: `ComfyUI-RetroEngine.RetroEngineNode`,
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name !== "RetroEngineNode") {
            return;
        }
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function() {
            onNodeCreated?.apply(this, arguments);
            const systemWidget = this.widgets.find(w => w.name === "system");
            const romWidget = this.widgets.find(w => w.name === "game_rom_path");
            const coreWidget = this.widgets.find(w => w.name === "core");
            const allOptionsWidget = this.widgets.find(w => w.name === "all_options");
            const biosWidget = this.widgets.find(w => w.name === "bios_path"); 
            if (!systemWidget || !romWidget || !coreWidget || !allOptionsWidget || !biosWidget) {
                console.error(`[Retro Engine Node ${this.id}] Critical widgets (system, rom, core, all_options, or bios) not found! Cannot set up dynamic updates.`);
                return;
            }
            hideWidget(allOptionsWidget);
            hideWidget(this.widgets.find(w => w.name === "screen_data"));
            this.dynamicWidgets = { systemWidget, romWidget, coreWidget, biosWidget }; 
            if (!biosWidget.originalType) { 
                biosWidget.originalType = biosWidget.type; 
            }
            try {
                this.allOptionsData = JSON.parse(allOptionsWidget.value);
            } catch (e) {
                console.error(`[Retro Engine Node ${this.id}] Failed to parse all_options JSON:`, e);
                this.allOptionsData = null;
                return;
            }
            this.updateDynamicWidgets(systemWidget.value);
            const originalCallback = systemWidget.callback;
            systemWidget.callback = (value) => {
                originalCallback?.apply(this, [value]);
                this.updateDynamicWidgets(value);
            };
        };
        nodeType.prototype.updateDynamicWidgets = function(selectedSystem) {
            if (!this.allOptionsData || !this.dynamicWidgets) {
                console.error(`[Retro Engine Node ${this.id}] updateDynamicWidgets: Missing data or references.`);
                return;
            }
            const { romWidget, coreWidget, biosWidget: biosWidgetRef } = this.dynamicWidgets; 
            if (!romWidget || !coreWidget || !biosWidgetRef) { 
                console.error(`[Retro Engine Node ${this.id}] updateDynamicWidgets: ROM, Core, or BIOS widget reference missing.`);
                return;
            }

            const optionsForSystem = this.allOptionsData[selectedSystem];
            if (!optionsForSystem) {
                console.error(`[Retro Engine Node ${this.id}] No options found for system: ${selectedSystem}`);
                romWidget.options.values = ["Error: No ROMs found"];
                coreWidget.options.values = ["Error: No Cores found"];
                romWidget.value = romWidget.options.values[0];
                coreWidget.value = coreWidget.options.values[0];
            } else {
                const roms = optionsForSystem.roms?.length > 0 ? optionsForSystem.roms : ["No ROMs found for " + selectedSystem];
                romWidget.options.values = roms;
                const defaultRom = roms.find(r => !r.includes("placeholder") && !r.startsWith("No ROMs")) || roms[0];
                romWidget.value = defaultRom;
                if (this.widgets_values && this.widgets_values.length > romWidget.id) {
                    this.widgets_values[romWidget.id] = romWidget.value;
                }

                const cores = optionsForSystem.cores?.length > 0 ? optionsForSystem.cores : ["No Cores found for " + selectedSystem];
                coreWidget.options.values = cores;
                const defaultCore = cores.find(c => !c.startsWith("ERROR_") && !c.startsWith("No Cores") && c !== "N/A") || cores[0];
                coreWidget.value = defaultCore;
                if (this.widgets_values && this.widgets_values.length > coreWidget.id) {
                    this.widgets_values[coreWidget.id] = coreWidget.value;
                }
            }

            
            const systemRequiresBios = BIOS_REQUIRED.has(selectedSystem);
            if (systemRequiresBios) {
                showWidget(biosWidgetRef, biosWidgetRef.originalType || "combo");
            } else {
                hideWidget(biosWidgetRef);
            }

            
            const newSize = this.computeSize();
            
            if (!this.size || this.size.length !== 2 || this.size[0] !== newSize[0] || this.size[1] !== newSize[1]) {
                this.size = newSize;
            }
            
            this.setDirtyCanvas(true, true);
            if (app.graph) {
                 app.graph.setDirtyCanvas(true, true);
            }
        };

        const origConstructor = nodeType.prototype.constructor;
        nodeType.prototype.constructor = function() {
            origConstructor.apply(this, arguments);
            this.serialize_widgets = true;
            this.powerButtonState = { isHovered: false, isOn: false };
            if (!this.flags) this.flags = {};
            this.flags.collapsed = false;
        };

        Object.assign(nodeType.prototype, {
            
            isPowerButtonHit(localX, localY) {
                
                const buttonX = POWER_BUTTON.MARGIN;
                const buttonY = LiteGraph.NODE_WIDGET_MARGIN || 8;
                return localX >= buttonX && localX <= buttonX + POWER_BUTTON.WIDTH &&
                       localY >= buttonY && localY <= buttonY + POWER_BUTTON.HEIGHT;
            },

            startEmulator() {
                this.stopEmulator();
                const allWidgets = this.widgets || [];
                let system = "PlayStation";
                let romPath = "";
                let biosPath = "";
                let width = 640;
                let height = 480;
                let coreName = "";
                for (const widget of allWidgets) {
                    switch (widget.name) {
                        case "system": system = widget.value; break;
                        case "game_rom_path": romPath = widget.value; break;
                        case "bios_path": biosPath = widget.value; break;
                        case "width": width = widget.value; break;
                        case "height": height = widget.value; break;
                        case "core": coreName = widget.value; break;
                    }
                }

                
                if (!romPath || romPath.includes("placeholder") || romPath.includes("Select ") || romPath.startsWith("No ROMs found")) {
                    console.error(`[Retro Engine Node ${this.id}] Invalid ROM path selected: ${romPath}`);
                    this.showError(`Please select a valid ROM file for ${system}.`);
                    this.powerButtonState.isOn = false;
                    this.setDirtyCanvas(true, true);
                    return;
                }
                if (!coreName || coreName.startsWith("ERROR_") || coreName.includes("Select ") || coreName.startsWith("No Cores found") || coreName === "N/A") {
                    const systemRequiresCore = !(coreName === "N/A"); 
                    if (systemRequiresCore && (coreName.startsWith("ERROR_") || coreName.includes("Select "))) {
                        console.error(`[PS1 Node ${this.id}] Invalid Core selected or required: ${coreName}`);
                        this.showError(`Emulator core issue for ${system}: ${coreName}. Ensure cores are downloaded.`);
                        this.powerButtonState.isOn = false;
                        this.setDirtyCanvas(true, true);
                        return;
                    } else if (coreName === "N/A") {
                        coreName = ""; 
                    } else if (coreName.startsWith("No Cores found")){ 
                        console.error(`[PS1 Node ${this.id}] No core available for ${system}.`);
                        this.showError(`No core found for ${system}. Cannot start emulation.`);
                        this.powerButtonState.isOn = false;
                        this.setDirtyCanvas(true, true);
                        return;
                    }
                }
                
                
                let effectiveBiosPath = "";
                const isBiosNeeded = BIOS_REQUIRED.has(system);
                if (isBiosNeeded) {
                    if (!biosPath || biosPath.includes("placeholder") || biosPath === "N/A") {
                        console.error(`[PS1 Node ${this.id}] Invalid or missing BIOS path for required system ${system}: ${biosPath}`);
                        this.showError(`Please select a valid BIOS file for ${system}.`);
                        this.powerButtonState.isOn = false;
                        this.setDirtyCanvas(true, true);
                        return;
                    }
                    effectiveBiosPath = biosPath;
                }

                const effectiveCoreName = coreName;
                this.createEmulatorDialog(system, romPath, effectiveBiosPath, width, height, effectiveCoreName);
            },

            createEmulatorDialog(system, romPath, biosPath, width, height, coreName) {
                const dialogContainer = document.createElement("div");
                dialogContainer.className = "ps1-emulator-dialog";
                Object.assign(dialogContainer.style, {
                    position: "fixed", width: `${EMULATOR_DIALOG.WIDTH}px`, height: `${EMULATOR_DIALOG.HEIGHT}px`,
                    backgroundColor: EMULATOR_DIALOG.BACKGROUND, border: EMULATOR_DIALOG.BORDER,
                    borderRadius: EMULATOR_DIALOG.BORDER_RADIUS, boxShadow: EMULATOR_DIALOG.SHADOW,
                    zIndex: "10000", display: "flex", flexDirection: "column"
                });

                const titleBar = document.createElement("div");
                Object.assign(titleBar.style, {
                    height: `${EMULATOR_DIALOG.TITLE_HEIGHT}px`, backgroundColor: "#333", borderBottom: "1px solid #555",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "0 10px", cursor: "move"
                });
                dialogContainer.appendChild(titleBar);
                
                const titleText = document.createElement("div");
                titleText.textContent = `${system} Emulator`;
                Object.assign(titleText.style, { color: "#fff", fontWeight: "bold" });
                titleBar.appendChild(titleText);
                
                const closeButton = document.createElement("button");
                closeButton.innerHTML = "✕";
                Object.assign(closeButton.style, {
                    background: "none", border: "none", color: "#fff",
                    fontSize: "16px", cursor: "pointer"
                });
                closeButton.onclick = () => this.stopEmulator();
                titleBar.appendChild(closeButton);
                
                const contentArea = document.createElement("div");
                Object.assign(contentArea.style, { flex: "1", overflow: "hidden", position: "relative" });
                dialogContainer.appendChild(contentArea);
                
                const statusMessage = document.createElement("div");
                statusMessage.textContent = "Loading emulator...";
                Object.assign(statusMessage.style, {
                    position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
                    color: "#fff", fontSize: "18px"
                });
                contentArea.appendChild(statusMessage);
                
                const emulatorFrame = document.createElement("iframe");
                Object.assign(emulatorFrame.style, {
                    width: "100%", height: "100%", border: "none",
                    opacity: "0", transition: "opacity 0.5s"
                });
                emulatorFrame.onload = () => {
                    statusMessage.style.display = "none";
                    emulatorFrame.style.opacity = "1";
                    
                    try {
                        const doc = emulatorFrame.contentDocument || emulatorFrame.contentWindow.document;
                        const canv = doc.querySelector('canvas');
                        if (canv) {
                            
                            canv.width = Math.floor(width/4);
                            canv.height = Math.floor(height/4);
                            
                            canv.style.width = `${width}px`;
                            canv.style.height = `${height}px`;
                            canv.style.imageRendering = 'pixelated';
                        }
                    } catch (e) {
                        console.warn(`[Retro Engine Node ${this.id}] Canvas scaling failed:`, e);
                    }
                };
                contentArea.appendChild(emulatorFrame);

                document.body.appendChild(dialogContainer);

                
                try {
                    requestAnimationFrame(() => {
                        const containerWidth = dialogContainer.offsetWidth;
                        const containerHeight = dialogContainer.offsetHeight;
                        if (containerWidth > 0 && containerHeight > 0) {
                            const topPos = Math.max(0, (window.innerHeight - containerHeight) / 2);
                            const leftPos = Math.max(0, (window.innerWidth - containerWidth) / 2);
                            dialogContainer.style.top = `${topPos}px`;
                            dialogContainer.style.left = `${leftPos}px`;
                        } else {
                            console.warn(`[PS1 Node ${this.id}] Dialog dimensions not ready for JS centering.`);
                            dialogContainer.style.top = '0px';
                            dialogContainer.style.left = '0px';
                        }
                    });
                } catch (e) {
                    console.error("Error during JS centering:", e);
                    dialogContainer.style.top = '10px';
                    dialogContainer.style.left = '10px';
                }

                this.makeDraggable(dialogContainer, titleBar);
                this.emulatorDialog = dialogContainer;
                this.emulatorFrame = emulatorFrame;
                this.loadEmulatorInFrame(emulatorFrame, system, romPath, width, height, coreName);
            },

            makeDraggable: makeDraggable,

            loadEmulatorInFrame(frame, system, romPath, width, height, coreName) {
                const runnerParams = new URLSearchParams();
                if (coreName) runnerParams.append("core", coreName);
                if (romPath) runnerParams.append("rom", romPath);

                
                const isBiosNeeded = BIOS_REQUIRED.has(system);
                if (isBiosNeeded) {
                    const biosWidget = this.widgets?.find(w => w.name === "bios_path");
                    const currentBiosValue = biosWidget?.value;
                    if (biosWidget && currentBiosValue && !currentBiosValue.includes("placeholder") && currentBiosValue !== "N/A") {
                        runnerParams.append("bios", currentBiosValue);
                    } else {
                        console.warn(`[PS1 Node ${this.id}] BIOS needed for ${system}, but current value is invalid/missing.`);
                    }
                }

                runnerParams.append("width", width);
                runnerParams.append("height", height);
                const runnerUrl = `${EXTENSION_BASE_PATH}/emulator_runner.html?${runnerParams.toString()}`;
                frame.src = runnerUrl;
            },
            
            onDrawForeground(ctx) {
                if (!this.flags.collapsed && this.size) {
                    const [nodeWidth, nodeHeight] = this.size;
                    const buttonY = LiteGraph.NODE_WIDGET_MARGIN || 8;
                    const state = this.powerButtonState || { isOn: false, isHovered: false };

                    const { bgColor, borderColor } = getPowerButtonColors(state.isOn, state.isHovered);
                    const iconColor = POWER_BUTTON.COLORS.TEXT;
                    const cornerRadius = 8; 

                    
                    ctx.fillStyle = bgColor;
                    this.drawRoundRect(ctx, POWER_BUTTON.MARGIN, buttonY, POWER_BUTTON.WIDTH, POWER_BUTTON.HEIGHT, cornerRadius);
                    ctx.fill();

                    
                    ctx.strokeStyle = borderColor;
                    ctx.lineWidth = 2;
                    this.drawRoundRect(ctx, POWER_BUTTON.MARGIN, buttonY, POWER_BUTTON.WIDTH, POWER_BUTTON.HEIGHT, cornerRadius);
                    ctx.stroke();

                    
                    ctx.fillStyle = iconColor;
                    ctx.font = "bold 14px Arial"; 
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText("⏻", POWER_BUTTON.MARGIN + POWER_BUTTON.WIDTH / 2, buttonY + POWER_BUTTON.HEIGHT / 2 + 1); 

                    this.powerButtonBounds = { x: POWER_BUTTON.MARGIN, y: buttonY, width: POWER_BUTTON.WIDTH, height: POWER_BUTTON.HEIGHT };
                } else {
                    this.powerButtonBounds = null;
                }
            },
            drawRoundRect: drawRoundRect,
            onMouseDown(event, pos, graphCanvas) {
                if (!this.flags.collapsed) {
                    const [localX, localY] = pos;
                    if (this.isPowerButtonHit(localX, localY)) {
                        this.powerButtonState = this.powerButtonState || { isOn: false, isHovered: false };
                        this.powerButtonState.isOn = !this.powerButtonState.isOn;
                        this.toggleEmulator();
                        this.setDirtyCanvas(true, true);
                        return true;
                    }
                }
                return false;
            },
            onMouseMove(event, pos, graphCanvas) {
                if (!this.flags.collapsed) {
                    const [localX, localY] = pos;
                    const isHovered = this.isPowerButtonHit(localX, localY);
                    const currentHover = this.powerButtonState?.isHovered || false;
                    if (isHovered !== currentHover) {
                        this.powerButtonState = this.powerButtonState || {};
                        this.powerButtonState.isHovered = isHovered;
                        this.setDirtyCanvas(true, false);
                    }
                }
            },
            computeSize() {
                const minWidth = 350;
                let minHeight = (LiteGraph.NODE_TITLE_HEIGHT || 20) + 5; 
                if (this.widgets && this.widgets.length > 0) {
                    const visibleWidgets = this.widgets.filter(w => w.name !== 'all_options');
                    const slotHeight = LiteGraph.NODE_SLOT_HEIGHT || 20;
                    const widgetMargin = LiteGraph.NODE_WIDGET_MARGIN || 4;
                    minHeight += visibleWidgets.reduce((acc, w) => acc + (w.computeSize ? w.computeSize()[1] : slotHeight) + widgetMargin, 0);
                }
                minHeight += POWER_BUTTON.HEIGHT + POWER_BUTTON.MARGIN * 2; 
                const width = Math.max(minWidth, this.size ? this.size[0] : minWidth);
                const height = Math.max(150, minHeight); 
                return [width, height];
            },
            toggleEmulator() {
                if (this.powerButtonState?.isOn) {
                    this.startEmulator();
                } else {
                    this.stopEmulator();
                }
            },
            stopEmulator() {
                if (this.emulatorDialog) {
                    if (this.emulatorFrame) this.emulatorFrame.src = 'about:blank'; 
                    document.body.removeChild(this.emulatorDialog);
                    this.emulatorDialog = null;
                }
                this.emulatorFrame = null;
                if (this.powerButtonState?.isOn) {
                    this.powerButtonState.isOn = false;
                    this.setDirtyCanvas(true, true);
                }
            },
            showError(message) {
                alert(`[Retro Engine Node Error]: ${message}`);
            },
        });
    }
});


(function() {
    if (app.originalGraphToPrompt_retroengine_v2) return;
    app.originalGraphToPrompt_retroengine_v2 = app.graphToPrompt;
    app.graphToPrompt = async function() {
        const prompt = await app.originalGraphToPrompt_retroengine_v2.apply(this, arguments);
        if (!prompt || !prompt.output) return prompt;
        for (const nodeId in prompt.output) {
            const nodeData = prompt.output[nodeId];
            if (nodeData.class_type === "RetroEngineNode") {
                const graphNode = app.graph.getNodeById(Number(nodeId));
                if (graphNode?.widgets) {
                    const screenDataWidget = graphNode.widgets.find(w => w.name === "screen_data");
                    const romWidget = graphNode.widgets.find(w => w.name === "game_rom_path");
                    const coreWidget = graphNode.widgets.find(w => w.name === "core");
                    if (!nodeData.inputs) nodeData.inputs = {};
                    if (romWidget) nodeData.inputs.game_rom_path = romWidget.value;
                    if (coreWidget) nodeData.inputs.core = coreWidget.value;
                    if (screenDataWidget) {
                        let widgetValue = "";
                        try {
                            const isRunning = !!(graphNode.emulatorDialog && graphNode.emulatorFrame);
                            if (isRunning) {
                                widgetValue = await captureAndSendCanvasAsync(graphNode);
                            } else {
                                widgetValue = screenDataWidget.value || "";
                            }
                        } catch (e) {
                            console.error(`[RetroEngine Patch] Node ${nodeId}: capture failed:`, e);
                            widgetValue = screenDataWidget.value || "";
                        }
                        nodeData.inputs.screen_data = widgetValue;
                    }
                }
            }
        }
        return prompt;
    };
})(); 