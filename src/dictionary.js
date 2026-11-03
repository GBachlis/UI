function DictionaryPlugin() {
    return function install(openmct) {
        openmct.types.addType('rocket.pressure', { name: 'Pressure Transducer', cssClass: 'icon-telemetry' });
        openmct.types.addType('rocket.temp', { name: 'Temperature Sensor', cssClass: 'icon-telemetry' });
        openmct.types.addType('rocket.servo', { name: 'Servo Ball Valve', cssClass: 'icon-telemetry' });
        openmct.types.addType('rocket.weight', { name: 'Load Cell', cssClass: 'icon-telemetry' });
        openmct.types.addType('rocket.state', { name: 'System State', cssClass: 'icon-telemetry' });

        openmct.objects.addRoot({ namespace: 'rocket', key: 'sensors-folder' });

        const SENSORS = [
            { key: 'pt-m1', name: 'PT-M1 (Manifold 1)', type: 'rocket.pressure', unit: 'bar', range: [0, 200] },
            { key: 'pt-m2', name: 'PT-M2 (Manifold 2)', type: 'rocket.pressure', unit: 'bar', range: [0, 200] },
            { key: 'pt-c', name: 'PT-C (Combustion)', type: 'rocket.pressure', unit: 'bar', range: [0, 200] },
            { key: 'pt-n2', name: 'PT-N2 (Ethanol Up)', type: 'rocket.pressure', unit: 'bar', range: [0, 200] },
            { key: 'pt-ed', name: 'PT-ED (Ethanol Down)', type: 'rocket.pressure', unit: 'bar', range: [0, 200] },
            { key: 'pt-lu', name: 'PT-LU (LOx Up)', type: 'rocket.pressure', unit: 'bar', range: [0, 200] },
            { key: 'pt-ld', name: 'PT-LD (LOx Down)', type: 'rocket.pressure', unit: 'bar', range: [0, 200] },
            { key: 'pt-p', name: 'PT-P (Pressurant)', type: 'rocket.pressure', unit: 'bar', range: [0, 400] },
            { key: 'pt-fs', name: 'PT-FS (Fire Suppression)', type: 'rocket.pressure', unit: 'bar', range: [0, 200] },
            { key: 'r-embv', name: 'R-EMBV (Ethanol Main)', type: 'rocket.servo', unit: 'deg', range: [0, 90] },
            { key: 'r-lmbv', name: 'R-LMBV (LOx Main)', type: 'rocket.servo', unit: 'deg', range: [0, 90] },
            { key: 'r-evbv', name: 'R-EVBV (Ethanol Vent)', type: 'rocket.servo', unit: 'deg', range: [0, 90] },
            { key: 'r-lvbv', name: 'R-LVBV (LOx Vent)', type: 'rocket.servo', unit: 'deg', range: [0, 90] },
            ...Array.from({ length: 8 }, (_, i) => ({ key: `tc-${i + 1}`, name: `TC-${i + 1}`, type: 'rocket.temp', unit: '°C', range: [0, 1200] })),
            
            // Και τα 5 RTD ολογράφως για να διαβαστούν σίγουρα από το JSON
            { key: 'rtd-1', name: 'RTD-1', type: 'rocket.temp', unit: '°C', range: [-200, 200] },
            { key: 'rtd-2', name: 'RTD-2', type: 'rocket.temp', unit: '°C', range: [-200, 200] },
            { key: 'rtd-3', name: 'RTD-3', type: 'rocket.temp', unit: '°C', range: [-200, 200] },
            { key: 'rtd-4', name: 'RTD-4', type: 'rocket.temp', unit: '°C', range: [-200, 200] },
            { key: 'rtd-5', name: 'RTD-5', type: 'rocket.temp', unit: '°C', range: [-200, 200] },

            { key: 'lc-t', name: 'LC-T (Thrust)', type: 'rocket.weight', unit: 'kgf', range: [0, 5000] },
            { key: 'lc-l', name: 'LC-L (LOx Weight)', type: 'rocket.weight', unit: 'kg', range: [0, 50] },
            { key: 'lc-e', name: 'LC-E (Ethanol Weight)', type: 'rocket.weight', unit: 'kg', range: [0, 50] },
            { key: 'pyro', name: 'PYRO Igniter', type: 'rocket.state', unit: 'State', range: [0, 1] },
            { key: 'oxygen', name: 'OXYGEN Level', type: 'rocket.pressure', unit: '%', range: [0, 100] }
        ];

        openmct.objects.addProvider('rocket', {
            get: function (identifier) {
                if (identifier.key === 'sensors-folder') {
                    return Promise.resolve({
                        identifier, name: 'Static Fire Systems', type: 'folder', location: 'ROOT',
                        composition: SENSORS.map(s => ({ namespace: 'rocket', key: s.key }))
                    });
                }
                const sensor = SENSORS.find(s => s.key === identifier.key);
                if (sensor) {
                    return Promise.resolve({
                        identifier, name: sensor.name, type: sensor.type, location: 'rocket:sensors-folder',
                        telemetry: {
                            values: [
                                { key: 'value', name: 'Value', unit: sensor.unit, format: 'float', hints: { range: 1 }, min: sensor.range[0], max: sensor.range[1] },
                                { key: 'utc', source: 'timestamp', name: 'Timestamp', format: 'utc', hints: { domain: 1 } }
                            ]
                        }
                    });
                } else {
                    // Αυτή η γραμμή προστατεύει το OpenMCT. Αν το JSON ζητήσει ανύπαρκτο αισθητήρα, 
                    // αντί να κρασάρει, απλώς απορρίπτει ελεγχόμενα το αντικείμενο.
                    return Promise.reject(new Error("Sensor not found: " + identifier.key));
                }
            }
        });
    };
}