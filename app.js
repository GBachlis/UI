openmct.setAssetPath('node_modules/openmct/dist');

openmct.install(openmct.plugins.LocalStorage());
openmct.install(openmct.plugins.MyItems());
openmct.install(openmct.plugins.UTCTimeSystem());
openmct.install(openmct.plugins.Espresso());
openmct.install(openmct.plugins.Clock({ enableClockIndicator: true }));
openmct.install(openmct.plugins.SummaryWidget());
openmct.install(openmct.plugins.DisplayLayout({
    showAsView: ['summary-widget']
}));

openmct.install(openmct.plugins.Conductor({
    menuOptions: [{
        name: 'Realtime',
        timeSystem: 'utc',
        clock: 'local',
        clockOffsets: {
            start: -15 * 60 * 1000,
            end: 30 * 1000
        }
    }]
}));


// ==========================================
// TELEMETRY FIRST
// ==========================================

const BACKEND_URL = 'ws://192.168.88.42:8081';

openmct.install(
    TelemetryPlugin(BACKEND_URL)
);


// ==========================================
// CUSTOM PLUGINS
// ==========================================

openmct.install(CustomThermometerPlugin());
openmct.install(CustomHorizontalBarPlugin());
openmct.install(DictionaryPlugin());
openmct.install(RocketRotationPlugin());
openmct.install(InteractivePIDPlugin());
openmct.install(SmartDashboardPlugin());
openmct.install(CustomCircularGaugePlugin());
openmct.install(CustomGridPlotPlugin());
openmct.install(SetResetPlugin());
openmct.install(RateOfChangePlugin());
openmct.install(TapoCameraPlugin());

// ==========================================
// DASHBOARDS
// ==========================================

fetch('dashboards.json')
    .then(response => response.json())
    .then(data => {

        openmct.install(
            HardcodedDashboardsPlugin(data)
        );

        openmct.start(
            document.getElementById('openmct-app')
        );

    })
    .catch(error => {
        console.error(
            'Failed to load the dashboards.json file:',
            error
        );
    });