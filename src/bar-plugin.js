function CustomHorizontalBarPlugin() {
    return function install(openmct) {

        // 1. Δημιουργία του αντικειμένου και των πεδίων (Options)
        openmct.types.addType('custom.horizontalbar', {
            name: 'Horizontal Bar',
            description: 'A horizontal progress bar filling left to right',
            cssClass: 'icon-telemetry',
            creatable: true,
            initialize: function (domainObject) {
                domainObject.composition = [];
                domainObject.barMin = 0;    // Προεπιλεγμένο Min
                domainObject.barMax = 100;  // Προεπιλεγμένο Max
            },
            form: [
                {
                    key: 'barMin',
                    name: 'Minimum Value',
                    control: 'textfield',
                    cssClass: 'l-input-sm l-numeric'
                },
                {
                    key: 'barMax',
                    name: 'Maximum Value',
                    control: 'textfield',
                    cssClass: 'l-input-sm l-numeric'
                }
            ]
        });

        // 2. Η λογική του γραφικού (View)
        openmct.objectViews.addProvider({
            key: 'horizontal-bar-view',
            name: 'Horizontal Bar View',
            cssClass: 'icon-telemetry',
            canView: function (domainObject) {
                return domainObject.type === 'custom.horizontalbar';
            },
            view: function (domainObject) {
                let unsubscribeTelemetry;
                let unsubscribeMutation;
                let composition;
                let currentVal = 0;

                return {
                    show: function (element) {
                        // HTML & CSS για την Οριζόντια Μπάρα
                        element.innerHTML = `
                  <div style="display: flex; align-items: center; justify-content: center; height: 100%; width: 100%; padding: 15px; box-sizing: border-box; background: transparent;">
                    <div style="flex-grow: 1; height: 40px; background: #111; border: 2px solid #555; border-radius: 6px; position: relative; overflow: hidden; box-shadow: inset 0 0 5px rgba(0,0,0,0.8);">
                      <div id="bar-fill" style="height: 100%; width: 0%; background: linear-gradient(to right, #0088ff, #00ffcc); transition: width 0.2s ease-out;"></div>
                      <div id="bar-val" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: bold; color: white; text-shadow: 1px 1px 3px black;">--</div>
                    </div>
                  </div>
                `;

                        const fillEl = element.querySelector('#bar-fill');
                        const valEl = element.querySelector('#bar-val');

                        function updateView(val) {
                            if (val !== undefined) currentVal = val;

                            const min = Number(domainObject.barMin) || 0;
                            const max = Number(domainObject.barMax) || 100;

                            // Υπολογισμός ποσοστού
                            let percent = ((currentVal - min) / (max - min)) * 100;
                            percent = Math.max(0, Math.min(100, percent));

                            fillEl.style.width = percent + '%';
                            valEl.innerText = Number(currentVal).toFixed(2);

                            // --- ΝΕΑ ΛΟΓΙΚΗ ΓΙΑ ΑΛΛΑΓΗ ΧΡΩΜΑΤΟΣ ---
                            if (percent >= 90) {
                                fillEl.style.background = '#ff0000'; // Κόκκινο (Κρίσιμο)
                            } else if (percent >= 50) {
                                fillEl.style.background = '#ffaa00'; // Πορτοκαλί (Προειδοποίηση)
                            } else {
                                fillEl.style.background = 'linear-gradient(to right, #0088ff, #00ffcc)'; // Κανονικό Μπλε/Γαλάζιο
                            }
                        }

                        // Live Update όταν αλλάζεις τα όρια από τον Inspector
                        unsubscribeMutation = openmct.objects.observe(domainObject, '*', function (newObject) {
                            domainObject.barMin = newObject.barMin;
                            domainObject.barMax = newObject.barMax;
                            updateView();
                        });

                        composition = openmct.composition.get(domainObject);

                        function setupTelemetry(childObject) {
                            openmct.telemetry.request(childObject).then(data => {
                                if (data && data.length > 0) updateView(data[data.length - 1].value);
                            });
                            if (unsubscribeTelemetry) unsubscribeTelemetry();
                            unsubscribeTelemetry = openmct.telemetry.subscribe(childObject, data => {
                                updateView(data.value);
                            });
                        }

                        composition.on('add', setupTelemetry);

                        composition.load().then(children => {
                            if (children.length > 0) setupTelemetry(children[0]);
                        });
                    },
                    destroy: function () {
                        if (unsubscribeTelemetry) unsubscribeTelemetry();
                        if (unsubscribeMutation) unsubscribeMutation();
                    }
                };
            }
        });
    };
}