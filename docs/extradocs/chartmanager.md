
The ChartManager object links DataSources, loads column data on demand and manages charts/widgets. It is the main interface for interacting with MDV. The ChartManager's constructor requires list of DataStore configs, a dataloader object, a config for construction and optionally a listener. 
```
    const cm =  new ChartManager("mydiv",datasources,dataloader,config,listener)
```
* **mydiv** - the id or the element to house the app
* **datasources** - list of DataStore [configs]{@tutorial datasource}, these configs should also include a size parameter showing the number of rows in the data set
* **dataloader** - a dataloader which comprises of three parameters
    * **function** - this [function]{@tutorial dataloader} accepts a list of columns and returns a promise (not needed if all data is to be loaded from files)
    * **viewLoader** - a function that will return the [view]{@tutorial views} given the view name  
    * **files** - specifies static files (tsv,csv or json), which contain the data to display. Useful for small amounts of data (100 000s rows) and testing. If all the data is to be loaded dynamically then this is not required.
    ```json
    [
        {
            "type":"tsv",
            "dataSource":"cells",
            "url":"data/cell_all_archr.tsv"
        },
        {
            "type":"tsv",
            "dataSource":"genes",
            "url2":"data/genes.txt"
        }
    ]
    ```
* **listener** An optional listener function, although this can be added later with the *addListener* method.



## Listeners

Can be added with the method *addListener(id, function)* and removed with *removeListener(id)*. Alternatively a listener can be added as the last parameter when constructing the ChartManager object.

The listener should be a function which receives the type of event, the ChartManager object and any data associated with the event. A typical listener would be:-

```js
    (type,cm,data)=>{
        switch(type){
            case "view_loaded":
                ..do stuff with data
                break;
            case "state_saved":
                ..push data to server
                break;
        }
    }
```

The types of listeners are:- 

* **chart_added**  Called When a chart is added with notify=true e.g. when a user adds a chart. The data received is the chart object itself.
* **chart_removed** Called When a chart is removed with notify=true e.g. when a user removes a chart. The data received is the chart object itself.
* **state_saved** Called when the user saves the state. The data being the state object
* **view_loaded** Called when a view has been completely loaded i.e. all data retrieved and all the charts added. The data being passed is the view that was loaded
* **filtered** Called when a DataStore is filtered, passing the Dimension that has done the filtering



