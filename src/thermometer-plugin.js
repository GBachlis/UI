function CustomThermometerPlugin() {
    return function install(openmct) {

        // 1. Δημιουργία του αντικειμένου και των πεδίων (Options)
        openmct.types.addType('custom.thermometer', {
            name: 'Thermometer',
            description: 'A vertical thermometer visualization',
            cssClass: 'icon-temp',
            creatable: true,
            initialize: function (domainObject) {
                domainObject.composition = [];
                domainObject.thermoMin = 0;    // Προεπιλεγμένο Min
                domainObject.thermoMax = 1000; // Προεπιλεγμένο Max
            },
            // ΑΥΤΟ ΕΔΩ φτιάχνει τα κουτάκια για να βάζεις τιμές!
            form: [
                {
                    key: 'thermoMin',
                    name: 'Minimum Value (°C)',
                    control: 'textfield',
                    cssClass: 'l-input-sm l-numeric'
                },
                {
                    key: 'thermoMax',
                    name: 'Maximum Value (°C)',
                    control: 'textfield',
                    cssClass: 'l-input-sm l-numeric'
                }
            ]
        });

        // 2. Η λογική του γραφικού (View)
        openmct.objectViews.addProvider({
            key: 'thermometer-view',
            name: 'Thermometer View',
            cssClass: 'icon-temp',
            canView: function (domainObject) {
                return domainObject.type === 'custom.thermometer';
            },
            view: function (domainObject) {
                let unsubscribeTelemetry;
                let unsubscribeMutation;
                let composition;
                let currentVal = 0; // Κρατάμε την τιμή για όταν αλλάζεις τα όρια

                return {
                    show: function (element) {
                        element.innerHTML = `
                  <div style="display: flex; flex-direction: column; justify-content: center; align-items: center; height: 100%; background: transparent; padding: 10px;">
                    <div style="height: 120px; width: 16px; background: #111; border: 2px solid #555; border-bottom: none; border-radius: 10px 10px 0 0; position: relative;">
                      <div id="thermo-fill" style="position: absolute; bottom: 0; width: 100%; height: 0%; background: linear-gradient(to top, #ff0000, #ff5500); transition: height 0.2s ease-out; border-radius: 10px 10px 0 0;"></div>
                    </div>
                    <div style="width: 36px; height: 36px; background: #ff0000; border-radius: 50%; border: 2px solid #555; z-index: 2; margin-top: -5px;"></div>
                    <div id="thermo-val" style="margin-top: 15px; font-size: 18px; font-weight: bold; color: #00ffcc;">-- °C</div>
                  </div>
                `;

                        const fillEl = element.querySelector('#thermo-fill');
                        const valEl = element.querySelector('#thermo-val');

                        // Συνάρτηση που διαβάζει τα δικά σου Min/Max
                        function updateView(val) {
                            if (val !== undefined) currentVal = val;

                            // Διαβάζει τα όρια που έβαλες εσύ στον Inspector
                            const min = Number(domainObject.thermoMin) || 0;
                            const max = Number(domainObject.thermoMax) || 1000;

                            let percent = ((currentVal - min) / (max - min)) * 100;
                            percent = Math.max(0, Math.min(100, percent));

                            fillEl.style.height = percent + '%';
                            valEl.innerText = Number(currentVal).toFixed(1) + ' °C';

                            // --- ΛΟΓΙΚΗ ΑΛΛΑΓΗΣ ΧΡΩΜΑΤΟΣ ΘΕΡΜΟΜΕΤΡΟΥ ---
                            // Πάνω από 80% της κλίμακας -> Κόκκινο (Κίνδυνος)
                            // Μεταξύ 60% και 80% -> Πορτοκαλί (Προσοχή)
                            // Κάτω από 60% -> Κανονικό (Ασφαλές)
                            if (percent >= 80) {
                                fillEl.style.background = 'linear-gradient(to top, #ff0000, #ff0000)'; // Σταθερό Κόκκινο
                            } else if (percent >= 50) {
                                fillEl.style.background = 'linear-gradient(to top, #ffaa00, #ff5500)'; // Πορτοκαλί
                            } else {
                                fillEl.style.background = 'linear-gradient(to top, #00ff00, #00aa00)'; // Πράσινο (Ασφαλές)
                            }
                        }

                        // Ακούει πότε αλλάζεις τα όρια από τον Inspector (Live Update)
                        unsubscribeMutation = openmct.objects.observe(domainObject, '*', function (newObject) {
                            domainObject.thermoMin = newObject.thermoMin;
                            domainObject.thermoMax = newObject.thermoMax;
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