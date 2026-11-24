function CustomCircularGaugePlugin() {
    return function install(openmct) {
        
        openmct.types.addType('custom-gauge-type', {
            name: 'Live Circular Gauge (0-200)',
            description: 'Εμφανίζει δεδομένα τηλεμετρίας σε κυκλικό gauge.',
            creatable: true,
            cssClass: 'icon-dial',
            initialize: function (domainObject) {
                domainObject.composition = [];
            }
        });

        openmct.objectViews.addProvider({
            key: 'custom-circular-gauge-view',
            name: 'Live Circular Gauge (0-200)',
            cssClass: 'icon-dial',
            canView: function (domainObject) {
                return domainObject.type === 'custom-gauge-type' || domainObject.type.startsWith('rocket.');
            },
            view: function (domainObject) {
                let unsubscribe;

                return {
                    show: function (container) {
                        container.innerHTML = `
                            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; width: 100%; background: #1a1a24;">
                                <div id="gauge-title" style="color: #e0e0e0; font-size: 15px; font-weight: bold; margin-bottom: 15px; letter-spacing: 1.5px;">
                                    ${domainObject.name.toUpperCase()}
                                </div>
                                <canvas width="220" height="220" style="max-width: 100%;"></canvas>
                            </div>
                        `;
                        
                        const canvas = container.querySelector('canvas');
                        const ctx = canvas.getContext('2d');
                        const titleEl = container.querySelector('#gauge-title');

                        const min = 0;
                        const max = 200;

                        function drawGauge(value) {
                            ctx.clearRect(0, 0, canvas.width, canvas.height);
                            let percent = (value - min) / (max - min);
                            percent = Math.max(0, Math.min(1, percent));

                            const centerX = canvas.width / 2;
                            const centerY = canvas.height / 2;
                            const radius = 85;
                            const startAngle = Math.PI * 0.75;
                            const endAngle = Math.PI * 2.25;
                            const currentAngle = startAngle + (percent * (endAngle - startAngle));

                            // Φόντο (γκρι/μαύρο)
                            ctx.beginPath();
                            ctx.arc(centerX, centerY, radius, startAngle, endAngle);
                            ctx.lineWidth = 18;
                            ctx.lineCap = 'round';
                            ctx.strokeStyle = '#2d2b3b';
                            ctx.stroke();

                           
                            let gaugeColor = '#00e676'; // Πράσινο (Από 0% μέχρι 25%)
                            if (percent >= 0.85) {
                                gaugeColor = '#ff3333'; // Κόκκινο (Από 75% και πάνω)
                            } else if (percent >= 0.50) {
                                gaugeColor = '#ff9800'; // Πορτοκαλί (Από 20% μέχρι 75%)
                            }

                            // Ζωγραφίζουμε τη γραμμή με το δυναμικό χρώμα
                            ctx.beginPath();
                            ctx.arc(centerX, centerY, radius, startAngle, currentAngle);
                            ctx.lineWidth = 18;
                            ctx.lineCap = 'round';
                            ctx.strokeStyle = gaugeColor; 
                            ctx.stroke();

                            // Τιμή στο κέντρο
                            ctx.fillStyle = '#ffffff';
                            ctx.font = 'bold 30px "Lucida Console", Monaco, monospace';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(value.toFixed(1), centerX, centerY - 5);
                            
                            // Αριθμοί min / max
                            ctx.fillStyle = '#7a7a92';
                            ctx.font = '13px sans-serif';
                            ctx.fillText(min, centerX - 65, centerY + 70);
                            ctx.fillText(max, centerX + 65, centerY + 70);
                        }

                        function setupTelemetry(telemetryObject) {
                            titleEl.innerText = telemetryObject.name.toUpperCase();
                            
                            const meta = openmct.telemetry.getMetadata(telemetryObject);
                            const vMeta = meta ? meta.valuesForHints(['range'])[0] : null;
                            const valueKey = vMeta ? vMeta.key : 'value'; 

                            drawGauge(min);

                            unsubscribe = openmct.telemetry.subscribe(telemetryObject, (datum) => {
                                if (datum && datum[valueKey] !== undefined) {
                                    drawGauge(datum[valueKey]);
                                }
                            });
                        }

                        if (domainObject.type === 'custom-gauge-type') {
                            drawGauge(0); 
                            
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
                        if (unsubscribe) unsubscribe();
                    }
                };
            }
        });
    };
}
