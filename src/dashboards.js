function HardcodedDashboardsPlugin(dashboardsData) {

    return function install(openmct) {

        const namespace = 'custom-dashboards';

        // 1. Convert the downloaded JSON into a raw text string

        let rawString = JSON.stringify(dashboardsData);

       

        // 2. Global Find & Replace: Update all empty namespaces to our custom one

        // This instantly fixes every layout grid, folder, and widget link!

        rawString = rawString.replace(/"namespace":""/g, `"namespace":"${namespace}"`);

       

        // 3. Convert it back into a usable JavaScript object

        const parsedData = JSON.parse(rawString);

        const models = parsedData.openmct;



        // Find the root folder

        let rootKey = Object.keys(models).find(key => models[key].location === 'mine');



        openmct.objects.addRoot({

            namespace: namespace,

            key: rootKey

        });



        openmct.objects.addProvider(namespace, {

            get: function (identifier) {

                let model = models[identifier.key];

                if (model) {

                    let clone = JSON.parse(JSON.stringify(model));

                   

                    // Fix the top-level location pointers so it shows up in the UI tree

                    if (clone.location === 'mine') {

                        clone.location = 'ROOT';

                    } else if (clone.location) {

                        clone.location = namespace + ':' + clone.location;

                    }

                   

                    return Promise.resolve(clone);

                }

            }

        });

    }

}

