function RateOfChangePlugin() {
    return function install(openmct) {
        
        openmct.types.addType('sensor-rate-widget', {
            name: 'Rate of Change (Slope)',
            description: 'Δείχνει τον ρυθμό αύξησης ή μείωσης (κλίση) σε μονάδες ανά λεπτό.',
            creatable: true,
            cssClass: 'icon-telemetry',
            initialize: function (domainObject) {
                domainObject.composition = [];
            }
        });

        openmct.objectViews.addProvider({
            key: 'sensor-rate-view',
            name: 'Rate of Change View',
            cssClass: 'icon-telemetry',
            canView: function (domainObject) {
                return domainObject.type === 'sensor-rate-widget';
            },
            view: function (domainObject) {
                let unsubscribe;
                let dataHistory = []; 

                return {
                    show: function (container) {
                        container.innerHTML = `
                            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; width: 100%; background: #1a1a24; padding: 10px; box-sizing: border-box; border-radius: 5px;">
                                <div id="rate-title" style="color: #a0a0b0; font-size: 13px; font-weight: bold; margin-bottom: 8px; letter-spacing: 1px; text-transform: uppercase;">
                                    DRAG & DROP SENSOR
                                </div>
                                <div style="display: flex; align-items: baseline; justify-content: center; gap: 8px;">
                                    <div id="rate-arrow" style="font-size: 26px; color: #fff;">-</div>
                                    <div id="rate-value" style="font-size: 32px; font-weight: bold; color: #fff; font-family: 'Lucida Console', Monaco, monospace;">0.00</div>
                                    <div id="rate-unit" style="font-size: 14px; color: #7a7a92; margin-left: 2px;">/min</div>
                                </div>
                            </div>
                        `;

                        const titleEl = container.querySelector('#rate-title');
                        const arrowEl = container.querySelector('#rate-arrow');
                        const valueEl = container.querySelector('#rate-value');

                        function updateUI(rate) {
                            const formattedRate = Math.abs(rate).toFixed(2);
                            valueEl.innerText = formattedRate;

                            // Threshold 1.0 bar/min για να μην αναβοσβήνει με τον θόρυβο του αισθητήρα
                            if (rate > 1.0) { 
                                arrowEl.innerText = '▲';
                                arrowEl.style.color = '#00ffcc'; // Πράσινο/Cyan (Αύξηση)
                                valueEl.style.color = '#00ffcc';
                            } else if (rate < -1.0) {
                                arrowEl.innerText = '▼';
                                arrowEl.style.color = '#ff3366'; // Κόκκινο (Μείωση - Διαρροή)
                                valueEl.style.color = '#ff3366';
                            } else {
                                arrowEl.innerText = '-';
                                arrowEl.style.color = '#aaaaaa'; // Γκρι (Σταθερό)
                                valueEl.style.color = '#aaaaaa';
                            }
                        }

                        function setupTelemetry(telemetryObject) {
                            titleEl.innerText = (telemetryObject.name || 'SENSOR').toUpperCase() + ' RATE';
                            dataHistory = [];
                            
                            const meta = openmct.telemetry.getMetadata(telemetryObject);
                            const vMeta = meta ? meta.valuesForHints(['range'])[0] : null;
                            const valueKey = vMeta ? vMeta.key : 'value'; 
                            
                            if (unsubscribe) unsubscribe();
                            
                            unsubscribe = openmct.telemetry.subscribe(telemetryObject, (datum) => {
                                if (datum && datum[valueKey] !== undefined) {
                                    
                                    const now = Date.now();
                                    const val = parseFloat(datum[valueKey]);
                                    
                                    dataHistory.push({ v: val, t: now });
                                    
                                    const WINDOW_MS = 5000; 
                                    dataHistory = dataHistory.filter(p => now - p.t <= WINDOW_MS);

                                    if (dataHistory.length > 1) {
                                        const first = dataHistory[0];
                                        const last = dataHistory[dataHistory.length - 1];
                                        
                                        const dt = (last.t - first.t) / 1000.0; // Σε δευτερόλεπτα
                                        if (dt > 0) {
                                            const dv = last.v - first.v;
                                            const ratePerSec = dv / dt; 
                                            const ratePerMin = ratePerSec * 60.0; // Προβολή της μεταβολής στο 1 λεπτό
                                            updateUI(ratePerMin);
                                        }
                                    } else {
                                        updateUI(0);
                                    }
                                }
                            });
                        }

                        let composition = openmct.composition.get(domainObject);
                        if (composition) {
                            composition.load().then(children => {
                                if (children.length > 0) setupTelemetry(children[0]);
                            });
                            composition.on('add', (child) => {
                                setupTelemetry(child);
                            });
                        }
                    },
                    destroy: function () {
                        if (unsubscribe) unsubscribe();
                    }
                };
            }
        });
    };
}