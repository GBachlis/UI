// ==========================================
// ΜΗΧΑΝΙΣΜΟΣ HIGHLIGHT (Στοχευμένο)
// ==========================================
(function() {
    const sensorToHighlight = localStorage.getItem('asteria_highlight_sensor');
    
    if (sensorToHighlight) {
        localStorage.removeItem('asteria_highlight_sensor');

        let attempts = 0;
        const searchInterval = setInterval(() => {
            attempts++;
            
            const allMatchingWidgets = Array.from(document.querySelectorAll('.c-layout__item, .c-grid-item, .c-object-view, .c-telemetry-view, [data-sensor-key]'))
                .filter(w => w.getAttribute('data-sensor-key') === sensorToHighlight || w.textContent.includes(sensorToHighlight));

            const innermostWidgets = allMatchingWidgets.filter(w => {
                return !allMatchingWidgets.some(child => w !== child && w.contains(child));
            });

            if (innermostWidgets.length > 0) {
                clearInterval(searchInterval); 
                
                innermostWidgets.forEach(widget => {
                    const originalTransition = widget.style.transition;
                    const originalBoxShadow = widget.style.boxShadow;
                    const originalBorder = widget.style.border;
                    
                    widget.style.transition = 'all 0.3s ease-in-out';
                    widget.style.boxShadow = '0 0 30px 10px rgba(231, 76, 60, 0.9)'; 
                    widget.style.border = '2px solid #e74c3c';
                    
                    setTimeout(() => {
                        widget.style.boxShadow = originalBoxShadow;
                        widget.style.border = originalBorder;
                        setTimeout(() => { widget.style.transition = originalTransition; }, 300);
                    }, 3000);
                });
            }
            if (attempts > 100) clearInterval(searchInterval);
        }, 100);
    }
})();

// ==========================================
// Ο ΚΥΡΙΟΣ ΚΩΔΙΚΑΣ ΤΟΥ PLUGIN 
// ==========================================
function InteractivePIDPlugin() {
    return function install(openmct) {
        openmct.types.addType('asteria.interactive.pid', {
            name: 'Interactive P&ID',
            description: 'Clickable Piping and Instrumentation Diagram',
            cssClass: 'icon-object',
            creatable: true
        });

        openmct.objectViews.addProvider({
            key: 'interactive-pid-view',
            name: 'Interactive View',
            cssClass: 'icon-object',
            canView: function (domainObject) {
                return domainObject.type === 'asteria.interactive.pid';
            },
            view: function (domainObject) {
                let unsubscribes = []; 

                return {
                    show: function (container) {
                        const wrapper = document.createElement('div');
                        wrapper.style.position = 'absolute';
                        wrapper.style.top = '0';
                        wrapper.style.left = '0';
                        wrapper.style.right = '0';
                        wrapper.style.bottom = '0';
                        wrapper.style.backgroundColor = '#1e1e1e'; 
                        
                        // Φόρτωση του SVG μέσω fetch για απευθείας ένθεση στο DOM
                        fetch('src/pid-background.svg')
                            .then(response => {
                                if (!response.ok) throw new Error('Network response was not ok');
                                return response.text();
                            })
                            .then(svgText => {
                                const svgContainer = document.createElement('div');
                                svgContainer.style.position = 'absolute';
                                svgContainer.style.width = '100%';
                                svgContainer.style.height = '100%';
                                svgContainer.style.top = '0';
                                svgContainer.style.left = '0';
                                svgContainer.style.zIndex = '0';
                                svgContainer.innerHTML = svgText;
                                
                                const svgElement = svgContainer.querySelector('svg');
                                if (svgElement) {
                                    // 1. Αφαίρεση των hardcoded διαστάσεων για να μην κόβεται το σχέδιο
                                    svgElement.removeAttribute('width');
                                    svgElement.removeAttribute('height');
                                    
                                    // 2. Εξαναγκασμός προσαρμογής στο wrapper
                                    svgElement.style.width = '100%';
                                    svgElement.style.height = '100%';
                                    svgElement.style.position = 'absolute';
                                    svgElement.style.top = '0';
                                    svgElement.style.left = '0';
                                    
                                    // 3. Εμφάνιση των στοιχείων που τυχόν βγαίνουν εκτός των αυστηρών ορίων
                                    svgElement.style.overflow = 'visible';
                                    svgElement.setAttribute('preserveAspectRatio', 'none');
                                }
                                
                                wrapper.prepend(svgContainer);
                            })
                            .catch(err => console.warn('Could not load background SVG via fetch:', err));

                        const DICTIONARY_NAMESPACE = 'rocket'; 

                        const SENSORS = [
                            // --- ΑΙΣΘΗΤΗΡΕΣ ΠΙΕΣΗΣ (Pressure) ---
                            { key: 'pt-m1', name: 'PT-M1 (Manifold 1)', type: 'rocket.pressure', unit: 'bar', top: '54%', left: '44%' },
                            { key: 'pt-m2', name: 'PT-M2 (Manifold 2)', type: 'rocket.pressure', unit: 'bar', top: '54%', left: '56%' },
                            { key: 'pt-c',  name: 'PT-C (Combustion)',  type: 'rocket.pressure', unit: 'bar', top: '48%', left: '50%' },
                            { key: 'pt-n2', name: 'PT-N2 (Nitrogen Filling)', type: 'rocket.pressure', unit: 'bar', top: '31%', left: '62%' },
                            { key: 'pt-ed', name: 'PT-ED (Eth Down)',   type: 'rocket.pressure', unit: 'bar', top: '30%', left: '15%' },
                            { key: 'pt-lu', name: 'PT-LU (LOx Up)',     type: 'rocket.pressure', unit: 'bar', top: '31%', left: '38%' },
                            { key: 'pt-ld', name: 'PT-LD (LOx Down)',   type: 'rocket.pressure', unit: 'bar', top: '61%', left: '82%' },
                            { key: 'pt-p',  name: 'PT-P (Pressurant)',  type: 'rocket.pressure', unit: 'bar', top: '15%', left: '40%' },
                            { key: 'pt-fs', name: 'PT-FS (Fire Sup.)',  type: 'rocket.pressure', unit: 'bar', top: '50%', left: '15%' },

                            // --- THERMOCOUPLES (TC) ---
                            { key: 'tc-1', name: 'TC-1', type: 'rocket.temp', unit: '°C', top: '92%', left: '65%' },
                            { key: 'tc-2', name: 'TC-2', type: 'rocket.temp', unit: '°C', top: '90%', left: '35%' },
                            { key: 'tc-3', name: 'TC-3', type: 'rocket.temp', unit: '°C', top: '85%', left: '65%' },
                            { key: 'tc-4', name: 'TC-4', type: 'rocket.temp', unit: '°C', top: '83%', left: '35%' },
                            { key: 'tc-5', name: 'TC-5', type: 'rocket.temp', unit: '°C', top: '78%', left: '65%' },
                            { key: 'tc-6', name: 'TC-6', type: 'rocket.temp', unit: '°C', top: '76%', left: '35%' },
                            { key: 'tc-7', name: 'TC-7', type: 'rocket.temp', unit: '°C', top: '71%', left: '65%' },
                            { key: 'tc-8', name: 'TC-8', type: 'rocket.temp', unit: '°C', top: '69%', left: '35%' },

                            // --- RTDs ---
                            { key: 'rtd-1', name: 'RTD-1', type: 'rocket.temp', unit: '°C', top: '10%', left: '75%' },
                            { key: 'rtd-2', name: 'RTD-2', type: 'rocket.temp', unit: '°C', top: '15%', left: '75%' },
                            { key: 'rtd-3', name: 'RTD-3', type: 'rocket.temp', unit: '°C', top: '20%', left: '75%' },

                            // --- LOAD CELLS (Weight) ---
                            { key: 'lc-t', name: 'LC-T (Thrust)',      type: 'rocket.weight', unit: 'kgf', top: '6%', left: '50%' },
                            { key: 'lc-l', name: 'LC-L (LOx Weight)',  type: 'rocket.weight', unit: 'kg',  top: '40%', left: '33%' },
                            { key: 'lc-e', name: 'LC-E (Eth Weight)',  type: 'rocket.weight', unit: 'kg',  top: '40%', left: '67%' }
                        ];

                        const BOARDS = {
                            pressure: '#/browse/custom-dashboards:20c2050f-0c0c-450c-87bd-e0f87fe1ea18/custom-dashboards:3be78941-bda4-4dbd-8acc-66c33a27e5fa?tc.mode=local&tc.startDelta=900000&tc.endDelta=30000&tc.timeSystem=utc&view=layout.view',
                            thermocouple: '#/browse/custom-dashboards:20c2050f-0c0c-450c-87bd-e0f87fe1ea18/custom-dashboards:0acd850c-1d6a-48d7-8c46-06a7baf9a2e2?tc.mode=local&tc.startDelta=900000&tc.endDelta=30000&tc.timeSystem=utc&view=layout.view',
                            rtd: '#/browse/custom-dashboards:20c2050f-0c0c-450c-87bd-e0f87fe1ea18/custom-dashboards:a1e3636b-8386-4a0a-8c7d-86d254005ea8?tc.mode=local&tc.startDelta=900000&tc.endDelta=30000&tc.timeSystem=utc&view=layout.view',
                            loadcell: '#/browse/custom-dashboards:20c2050f-0c0c-450c-87bd-e0f87fe1ea18/custom-dashboards:09e5a294-cd8f-4cd3-8afc-6ed7c53c3d05?tc.mode=local&tc.startDelta=900000&tc.endDelta=30000&tc.timeSystem=utc&view=layout.view'
                        };

                        function createSensorBox(sensor) {
                            const btn = document.createElement('div');
                            const exactSearchName = sensor.name.split(' (')[0];
                            
                            btn.innerText = `--- ${sensor.unit}`;
                            btn.setAttribute('data-sensor-key', exactSearchName);
                            
                            btn.style.position = 'absolute';
                            btn.style.top = sensor.top;
                            btn.style.left = sensor.left;
                            btn.style.transform = 'translate(-50%, -50%)';
                            btn.style.padding = '4px 8px';
                            btn.style.color = '#ffffff';
                            btn.style.borderRadius = '4px';
                            btn.style.fontFamily = 'monospace';
                            btn.style.fontSize = '12px';
                            btn.style.fontWeight = 'bold';
                            btn.style.whiteSpace = 'nowrap';
                            btn.style.cursor = 'pointer';
                            btn.style.zIndex = '10'; 
                            
                            let baseColor, borderColor, targetUrl;

                            if (sensor.type === 'rocket.pressure') {
                                baseColor = 'rgba(46, 125, 50, 0.2)'; borderColor = '#4caf50';
                                targetUrl = BOARDS.pressure;
                            } 
                            else if (sensor.type === 'rocket.temp') {
                                if (sensor.key.startsWith('tc')) {
                                    baseColor = 'rgba(198, 40, 40, 0.2)'; borderColor = '#e53935';
                                    targetUrl = BOARDS.thermocouple;
                                } else {
                                    baseColor = 'rgba(21, 101, 192, 0.2)'; borderColor = '#1e88e5';
                                    targetUrl = BOARDS.rtd;
                                }
                            } 
                            else if (sensor.type === 'rocket.weight') {
                                baseColor = 'rgba(97, 97, 97, 0.2)'; borderColor = '#9e9e9e';
                                targetUrl = BOARDS.loadcell;
                            }

                            btn.style.backgroundColor = baseColor;
                            btn.style.border = `1px solid ${borderColor}`;

                            btn.onmouseover = () => { btn.style.backgroundColor = borderColor; };
                            btn.onmouseout = () => { btn.style.backgroundColor = baseColor; };
                            
                            btn.onclick = (e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                localStorage.setItem('asteria_highlight_sensor', exactSearchName);
                                window.location.href = targetUrl;
                                window.location.reload();
                            };

                            const objectIdentifier = { namespace: DICTIONARY_NAMESPACE, key: sensor.key };
                            
                            openmct.objects.get(objectIdentifier).then(domainObject => {
                                const unsubscribe = openmct.telemetry.subscribe(domainObject, (datum) => {
                                    let val = datum.value !== undefined ? datum.value : datum[sensor.key];
                                    if (val !== undefined) {
                                        btn.innerText = `${Number(val).toFixed(2)} ${sensor.unit}`;
                                    }
                                });
                                unsubscribes.push(unsubscribe);
                            }).catch(e => {
                                console.warn(`Δεν βρέθηκε τηλεμετρία για: ${sensor.key}. Ελέγξτε το namespace.`);
                                btn.innerText = exactSearchName;
                            });

                            return btn;
                        }

                        SENSORS.forEach(sensor => {
                            const box = createSensorBox(sensor);
                            wrapper.appendChild(box);
                        });
                        
                        container.appendChild(wrapper);
                    },
                    destroy: function () {
                        unsubscribes.forEach(unsubscribe => unsubscribe());
                        container.innerHTML = '';
                    }
                };
            }
        });
    };
}