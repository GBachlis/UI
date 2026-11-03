function SetResetPlugin() {
    return function install(openmct) {
        
        openmct.types.addType('sensor-offset-button', {
            name: 'Sensor Set/Reset',
            description: 'Koumpia gia SET kai RESET me Drag & Drop',
            creatable: true,
            cssClass: 'icon-controls',
            initialize: function (domainObject) {
                domainObject.composition = [];
            }
        });

        openmct.objectViews.addProvider({
            key: 'sensor-offset-view',
            name: 'Control Panel',
            canView: function (domainObject) {
                return domainObject.type === 'sensor-offset-button';
            },
            view: function (domainObject) {
                let container;
                let composition;
                let currentSensorId = null; 

                // ΟΛΑ ΤΑ IDs ΜΕΤΑΤΡΕΜΜΕΝΑ ΣΕ ΔΕΚΑΔΙΚΑ ΓΙΑ ΤΗΝ C
                const sensorIdMap = {
                        "cj-1": 1536, "cj-2": 1538,
                        "tc-1": 1032, "tc-2": 1040, "tc-3": 1048, "tc-4": 1056, "tc-5": 1034, "tc-6": 1042, "tc-7": 1050, "tc-8": 1058,
                        "rtd-1": 1289, "rtd-2": 1297, "rtd-3": 1305, "rtd-4": 1313, "rtd-5": 1321,
                        "pt-m1": 280,  "pt-m2": 0,  "pt-c": 281,  "pt-n2": 282, "pt-ed": 264, "pt-lu": 272, "pt-ld": 273, "pt-p": 274, "pt-fs": 0,
                        "f-lfbv": 1804, "r-lmbv": 1801, "r-pvbv": 1809, "r-pmbv": 1793, "r-embv": 1802, "r-lvbv": 1810, "f-lvbv": 1803, "r-evbv": 1794,
                        "lc-t": 522,   "lc-l": 521,   "lc-e": 528,
                        "pyro": 1,     "oxygen": 2
                    };

                return {
                    show: function (element) {
                        container = document.createElement('div');
                        container.style.display = 'flex';
                        container.style.flexDirection = 'column';
                        container.style.alignItems = 'center';
                        container.style.justifyContent = 'center';
                        container.style.height = '100%'; 
                        container.style.padding = '5px';
                        container.style.color = '#ccc';
                        container.style.fontFamily = 'sans-serif';
                        container.style.boxSizing = 'border-box';
                        
                        const uniqueKey = domainObject.identifier.key;

                        container.innerHTML = `
                            <div id="sensor-name-${uniqueKey}" style="font-size: 13px; margin-bottom: 8px; color: #00ffff; text-align: center; font-weight: bold; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">
                                Drag & Drop Sensor
                            </div>
                            <div style="display: flex; gap: 8px; margin-bottom: 5px;">
                                <button id="btn-set-${uniqueKey}" style="background: #6a00a3; color: white; padding: 4px 12px; border: none; border-radius: 3px; cursor: pointer; font-size: 11px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.5);">SET</button>
                                <button id="btn-reset-${uniqueKey}" style="background: #a30062c5; color: white; padding: 4px 12px; border: none; border-radius: 3px; cursor: pointer; font-size: 11px; font-weight: bold; box-shadow: 0 2px 4px rgba(0,0,0,0.5);">RESET</button>
                            </div>
                            <div id="status-${uniqueKey}" style="font-size: 10px; min-height: 12px; text-align: center;"></div>
                        `;
                        
                        element.appendChild(container);

                        composition = openmct.composition.get(domainObject);
                        
                        function setupSensor(childObject) {
                            currentSensorId = childObject.identifier.key;
                            const nameEl = document.getElementById(`sensor-name-${uniqueKey}`);
                            if (nameEl) nameEl.innerText = (childObject.name || currentSensorId).toUpperCase();
                        }

                        if (composition) {
                            composition.on('add', setupSensor);
                            composition.load().then(children => {
                                if (children.length > 0) setupSensor(children[0]);
                            }).catch(err => console.error(err));
                        }

                        // --- ΝΕΑ ΛΟΓΙΚΗ ΑΠΟΣΤΟΛΗΣ (ΑΝΕΞΑΡΤΗΤΗ) ---
                        const sendCommand = (commandType) => {
                            const statusDiv = document.getElementById(`status-${uniqueKey}`);

                            if (!currentSensorId) {
                                statusDiv.innerText = 'Drop sensor first!';
                                statusDiv.style.color = '#170855';
                                return;
                            }

                            const cleanSensorId = currentSensorId.toLowerCase();
                            const numericId = sensorIdMap[cleanSensorId];

                            if (numericId === undefined) {
                                statusDiv.innerText = 'Άγνωστο ID!';
                                statusDiv.style.color = '#ff66a1';
                                return;
                            }

                            const payload = `${numericId}#${commandType}`; 
                            
                            // ΑΛΛΑΞΕ ΤΟ IP ΕΔΩ ΑΝ ΧΡΕΙΑΖΕΤΑΙ (Πρέπει να είναι το ίδιο με το app.js)
                            const WS_URL = 'ws://192.168.88.37:8081'; 
                            
                            statusDiv.innerText = 'Σύνδεση...';
                            statusDiv.style.color = '#aaa';

                            try {
                                const cmdSocket = new WebSocket(WS_URL);
                                
                                cmdSocket.onopen = () => {
                                    cmdSocket.send(payload);
                                    statusDiv.innerText = `${commandType} > ${cleanSensorId.toUpperCase()}`;
                                    statusDiv.style.color = '#33cc38';
                                    
                                    // Κλείνουμε τη σύνδεση μετά από 1 δευτερόλεπτο για να μην πιάνει slot στον server
                                    setTimeout(() => {
                                        cmdSocket.close();
                                        statusDiv.innerText = '';
                                    }, 1000);
                                };

                                cmdSocket.onerror = () => {
                                    statusDiv.innerText = 'Server Error!';
                                    statusDiv.style.color = '#ff6666';
                                };
                            } catch(e) {
                                statusDiv.innerText = 'Failed!';
                                statusDiv.style.color = '#ff6666';
                            }
                        };

                        document.getElementById(`btn-set-${uniqueKey}`).addEventListener('click', () => sendCommand('SET'));
                        document.getElementById(`btn-reset-${uniqueKey}`).addEventListener('click', () => sendCommand('RESET'));
                    },
                    destroy: function () {
                        if (container) {
                            container.remove();
                        }
                    }
                };
            }
        });
    };
}