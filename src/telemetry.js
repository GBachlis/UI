// We pass the wsUrl in so the backend IP isn't hardcoded
function TelemetryPlugin(wsUrl) {
    return function install(openmct) {
        const socket = new WebSocket(wsUrl);
        window.telemeterySocket = socket;
        const listeners = {};
        const pendingRequests = {};
        let isConnected = false;

        socket.onopen = () => { isConnected = true; console.log("Backend Connected!"); };
        socket.onclose = () => { isConnected = false; };
        socket.onerror = () => { isConnected = false; };

        socket.onmessage = function (event) {
            try {
                const data = JSON.parse(event.data);

                if (Array.isArray(data)) {
                    data.forEach(sensorData => {

                        // 1. FIX THE NAME: Force the C string ("PT-M1") to lowercase ("pt-m1")
                        const sensorId = sensorData.name.toLowerCase();

                        // 2. FIX THE TIME: Convert Nanoseconds down to Milliseconds
                        let timeMs = sensorData.timestamp;
                        // If the number is absurdly huge (nanoseconds), divide it by 1,000,000
                        if (timeMs > 9999999999999) {
                            timeMs = Math.floor(timeMs / 1000000);
                        }

                        // 3. Route the fixed data to the Open MCT gauges!
                        if (listeners[sensorId]) {
                            listeners[sensorId].forEach(cb => cb({
                                id: sensorId,
                                timestamp: timeMs,
                                utc: timeMs,
                                value: sensorData.value
                            }));
                        }
                    });
                }
            } catch (e) {
                console.error("Error parsing telemetry from C Backend:", e);
            }
        };

        openmct.telemetry.addProvider({
            supportsSubscribe: (obj) => obj.identifier.namespace === 'rocket',
            subscribe: function (domainObject, callback) {
                const sensorId = domainObject.identifier.key;
                if (!listeners[sensorId]) listeners[sensorId] = [];
                listeners[sensorId].push(callback);
                return function unsubscribe() { listeners[sensorId] = listeners[sensorId].filter(cb => cb !== callback); };
            },
            supportsRequest: (obj) => obj.identifier.namespace === 'rocket',
            request: function (domainObject, options) {
                return new Promise((resolve, reject) => {
                    // Instantly resolve with an empty array so Open MCT doesn't get stuck!
                    resolve([]);

                    /* --- WE WILL UNCOMMENT THIS LATER WHEN YOU ADD A DATABASE ---
                    const requestId = Math.random().toString(36).substring(2, 15);
                    pendingRequests[requestId] = { resolve, sensorId: domainObject.identifier.key };
                    
                    if (socket.readyState === WebSocket.OPEN) {
                        socket.send(JSON.stringify({
                            type: 'request_history',
                            sensorId: domainObject.identifier.key,
                            requestId: requestId,
                            start: options.start,
                            end: options.end
                        }));
                    }
                    ------------------------------------------------------------ */
                });
            },
        });
    }
}