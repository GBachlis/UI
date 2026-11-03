function CustomGridPlotPlugin() {
    return function install(openmct) {
        
        openmct.types.addType('custom-grid-plot', {
            name: 'Custom Grid Plot (Auto-Scale & UTC)',
            description: 'Γράφημα με δυναμική κλίμακα (auto-scale) και άξονα UTC χρόνου.',
            creatable: true,
            cssClass: 'icon-plot-resource',
            initialize: function (domainObject) {
                domainObject.composition = [];
            }
        });

        openmct.objectViews.addProvider({
            key: 'custom-grid-plot-view',
            name: 'Live Grid Plot (Auto-Scale & UTC)',
            cssClass: 'icon-plot-resource',
            canView: function (domainObject) {
                return domainObject.type === 'custom-grid-plot' || domainObject.type.startsWith('rocket.');
            },
            view: function (domainObject) {
                let unsubscribe;
                let dataHistory = [];
                const MAX_POINTS = 60; // Πλήθος σημείων
                const MS_PER_POINT = 1000; // Ρυθμός ανανέωσης

                return {
                    show: function (container) {
                        container.innerHTML = `
                            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; width: 100%; background: #1a1a24; padding: 10px; box-sizing: border-box;">
                                <div id="plot-title" style="color: #e0e0e0; font-size: 15px; font-weight: bold; margin-bottom: 5px; letter-spacing: 1.5px; text-align: center; width: 100%;">
                                    ${domainObject.name.toUpperCase()}
                                </div>
                                <div style="flex-grow: 1; width: 100%; position: relative;" id="canvas-container">
                                    <canvas style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></canvas>
                                </div>
                            </div>
                        `;
                        
                        const canvasContainer = container.querySelector('#canvas-container');
                        const canvas = container.querySelector('canvas');
                        const ctx = canvas.getContext('2d');
                        const titleEl = container.querySelector('#plot-title');
                        
                        function resizeCanvas() {
                            canvas.width = canvasContainer.clientWidth;
                            canvas.height = canvasContainer.clientHeight;
                            drawPlot();
                        }
                        window.addEventListener('resize', resizeCanvas);
                        setTimeout(resizeCanvas, 0); 

                        function drawPlot() {
                            if (canvas.width === 0 || canvas.height === 0) return;
                            const width = canvas.width;
                            const height = canvas.height;

                            ctx.clearRect(0, 0, width, height);

                            const padLeft = 40;   
                            const padBottom = 20; 
                            const padTop = 25;    
                            const padRight = 10;

                            const plotW = width - padLeft - padRight;
                            const plotH = height - padTop - padBottom;

                            // --- AUTO-SCALING ΛΟΓΙΚΗ ΓΙΑ ΤΟΝ ΑΞΟΝΑ Y ---
                            let minVal = 0;
                            let maxVal = 100; // Αρχικές τιμές αν δεν υπάρχουν δεδομένα
                            
                            if (dataHistory.length > 0) {
                                let trueMin = Math.min(...dataHistory);
                                let trueMax = Math.max(...dataHistory);
                                
                                if (trueMin === trueMax) {
                                    minVal = trueMin - 5;
                                    maxVal = trueMax + 5;
                                } else {
                                    // Δίνουμε ένα 15% περιθώριο πάνω-κάτω για να φαίνεται ωραία η γραμμή
                                    const padding = (trueMax - trueMin) * 0.15;
                                    minVal = trueMin - padding;
                                    maxVal = trueMax + padding;
                                }
                            }

                            ctx.strokeStyle = '#2d2b3b'; 
                            ctx.lineWidth = 1;
                            ctx.fillStyle = '#7a7a92'; 
                            ctx.font = '12px sans-serif';

                            const gridRows = 4; 
                            const gridCols = 4; 

                            // --- ΣΧΕΔΙΑΣΗ ΑΞΟΝΑ Y (ΔΥΝΑΜΙΚΕΣ ΤΙΜΕΣ) ---
                            ctx.textAlign = 'right';
                            ctx.textBaseline = 'middle';
                            for(let i = 0; i <= gridRows; i++) { 
                                let y = padTop + (plotH / gridRows) * i;
                                let val = maxVal - ((maxVal - minVal) / gridRows) * i; 
                                
                                ctx.beginPath();
                                ctx.moveTo(padLeft, y);
                                ctx.lineTo(width - padRight, y);
                                ctx.stroke();

                                // Τυπώνει με 1 δεκαδικό αν είναι μικρές τιμές, αλλιώς ακέραιο
                                let label = (maxVal - minVal < 10) ? val.toFixed(1) : Math.round(val);
                                ctx.fillText(label, padLeft - 5, y);
                            }

                            // --- ΣΧΕΔΙΑΣΗ ΑΞΟΝΑ X (UTC ΩΡΑ) ---
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'top';
                            
                            const now = Date.now();
                            const timeSpan = MAX_POINTS * MS_PER_POINT;
                            const startTime = now - timeSpan;

                            for(let i = 0; i <= gridCols; i++) { 
                                let x = padLeft + (plotW / gridCols) * i;
                                let timeAtX = startTime + (timeSpan / gridCols) * i;
                                
                                let utcString = new Date(timeAtX).toISOString().substr(11, 8);
                                
                                ctx.beginPath();
                                ctx.moveTo(x, padTop);
                                ctx.lineTo(x, height - padBottom);
                                ctx.stroke();

                                ctx.fillText(utcString, x, height - padBottom + 5);
                            }

                            if (dataHistory.length < 1) return;

                            // --- ΖΩΓΡΑΦΙΣΜΑ ΓΡΑΜΜΗΣ ΔΕΔΟΜΕΝΩΝ ---
                            ctx.save();
                            ctx.beginPath();
                            ctx.rect(padLeft, padTop, plotW, plotH);
                            ctx.clip(); 

                            ctx.beginPath();
                            ctx.strokeStyle = '#00e5ff'; 
                            ctx.lineWidth = 3;
                            ctx.lineJoin = 'round';

                            const stepX = plotW / (MAX_POINTS - 1);

                            for (let i = 0; i < dataHistory.length; i++) {
                                const val = dataHistory[i];
                                const x = padLeft + i * stepX + (plotW - (dataHistory.length - 1) * stepX); 
                                const y = padTop + plotH - ((val - minVal) / (maxVal - minVal)) * plotH;

                                if (i === 0) ctx.moveTo(x, y);
                                else ctx.lineTo(x, y);
                            }
                            ctx.stroke();
                            ctx.restore();
                            
                            const currentVal = dataHistory[dataHistory.length - 1];
                            ctx.fillStyle = '#00e5ff';
                            ctx.font = 'bold 16px "Lucida Console", Monaco, monospace';
                            ctx.textAlign = 'right';
                            ctx.textBaseline = 'top';
                            ctx.fillText(currentVal.toFixed(1) + ' bar', width - padRight, 2); 
                        }

                        function setupTelemetry(telemetryObject) {
                            titleEl.innerText = telemetryObject.name.toUpperCase();
                            dataHistory = []; 
                            
                            const meta = openmct.telemetry.getMetadata(telemetryObject);
                            const vMeta = meta ? meta.valuesForHints(['range'])[0] : null;
                            const valueKey = vMeta ? vMeta.key : 'value'; 
                            
                            unsubscribe = openmct.telemetry.subscribe(telemetryObject, (datum) => {
                                if (datum && datum[valueKey] !== undefined) {
                                    dataHistory.push(datum[valueKey]);
                                    if (dataHistory.length > MAX_POINTS) {
                                        dataHistory.shift(); 
                                    }
                                    drawPlot();
                                }
                            });
                            
                            setInterval(drawPlot, 1000);
                        }

                        if (domainObject.type === 'custom-grid-plot') {
                            drawPlot(); 
                            let composition = openmct.composition.get(domainObject);
                            if (composition) {
                                composition.load().then(children => {
                                    if (children.length > 0) setupTelemetry(children[0]);
                                });
                                composition.on('add', (child) => {
                                    if (unsubscribe) unsubscribe();
                                    setupTelemetry(child);
                                });
                            }
                        } else {
                            setupTelemetry(domainObject);
                        }
                    },
                    destroy: function () {
                        window.removeEventListener('resize', resizeCanvas);
                        if (unsubscribe) unsubscribe();
                    }
                };
            }
        });
    };
}