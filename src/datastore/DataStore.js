
import Dimension from "./Dimension.js";
//register dimensions
import  "./CategoryDimension.js";
import "./RangeDimension.js";
import "./CatColDimension.js";
import  "./CatRangeDimension.js";
import "./DensityDimension.js"
import {scaleLinear,scaleSymlog} from "d3-scale";
import {getColorLegend,getColorBar} from "../utilities/Color.js"
import {quantileSorted} from 'd3-array';


/**
* Creates an empty data structure
* @tutorial datasource
* @param {integer} size - the number of rows(items) of the data structure
* @param {Object} [config] - setup information for the datastore.
* @param {Object[]} [config.columns] - an array of column objects, specifying 
* the metadata for data structure, see {@link DataStore#addColumn}
* @param {Object[]} [config.columnGroups] - an array of objetcs each has
* name, and a list of columns in that group
* @param {Object} [config.links] - an object describing how this DataStore
* links with other DataStore
* @param {Object} [config.images] - an object describing thumbnails which
* are associated with each item/row in the DataStore
* @param {Object} [config.large_iamges] - an object describing large images which
* are associated with each item/row in the DataStore
* @param {Object} [config.offsets] - an object specofying which columns can
* have values that can be transformed and rotated and any transformations/
* rotations appplied to them
*/

class DataStore{
    constructor(size,config={}){       
        this.size=size;
        this.filterSize=size;
        this.columns=[];
        this.columnIndex={};
        this.listeners={};
        this.indexes={};
        this.filterBuffer= new SharedArrayBuffer(size);
        this.filterArray = new Uint8Array (this.filterBuffer);
        //keep track of dimensions and the columns they represent
        this.dimensions=[];
        this.name= config.name;
    
        this.textDecoder = new TextDecoder();
        this.columnGroups={};
        this.subtypeToGroup={};

        //info about subgroups and their datasources
        this.subgroups={};
        this.subgroupDataSources=new Set();
        this.accessOtherDataStore=[];
        this.syncColumnColors=[];
        this.linkColumns=[];


        this.columnsWithData=[];
        this.dirtyColumns={
            added:{},
            removed:{},
            data_changed:{},
            colors_changed:{}
        }
        this.dirtyMetadata=new Set();

        if (config.offsets){
            config.offsets.values = config.offsets.values || {};
            this.offsets=config.offsets;
        }
        this.images= config.images;
        this.genome_browser = config.genome_browser;
       
        if (config.columns){
            for (let c of config.columns){
                this.addColumn(c,c.data);
            }
        }

        if (config.columnGroups){
            for (let item of config.columnGroups){
                this.addColumnGroup(item);
            }
        }
        if (config.large_images){
            this.large_images=config.large_images;
        }
        if (config.links){
            this.links= config.links;
            for (let ds in config.links){
                const link = config.links[ds];
                if (link.rows_as_columns){
                    const sg= link.rows_as_columns.subgroups;
                    this.subgroupDataSources.add(ds);
                    for (let t in sg){
                            this.subgroups[t]={
                                subgroup:sg[t],
                                dataSource:ds,
                                name_column:link.rows_as_columns.name_column
                            }
                     }       
                }
                if (link.access_data){
                    this.accessOtherDataStore.push({
                        dataSource:ds,
                        index:link.index
                    });
                }
                if (link.sync_column_colors){
                    this.syncColumnColors.push({
                        dataSource:ds,
                        columns:link.sync_column_colors
                    });
                }
                if (link.columns){
                    this.linkColumns.push({
                        dataSource:ds,
                        columns:link.columns
                    })
                }
            }
        }   
    }


    /**
     * 
     * @returns {boolean} - true if the DataStore has been filtered
     * 
     */
    isFiltered(){
        return this.filterSize!==this.size;
    }

    /**
    * Adds a listener to the datastore that will be called when an event occurs,
    * passing the event type and any data. There are the following different types
    * of event:-
    * <ul>
    *   <li> filtered - called when a filter is applied. The dimension doing the
    *   the filtering is passed as data </li>
    *   <li> data_highlighted - called when certain indexes have been highlighted </li>
    *   <li> column_removed - called just before a column is removed </li> 
    *   <li> data_changed- called when data has changed giving a list of columns where
    *   the data has changed </li> 
    * </ul>
    * @param {string} id - a unique id identifying the listener
    * @param {function} listener - a function that accepts two paramaters, the type
    * of event and the data associated with it.
    */
    addListener(id,listener){
        //PJT: XXX: this replaces any existing listener with the same id, probably not intended
        this.listeners[id]=listener;
    }

    /**
    * Removes the specified listener from the datastore
    * @param {string} id The id of the listener to remove 
    */
    removeListener(id){
        delete this.listeners[id];
    }

    _callListeners(type,data){
        for (let id in this.listeners){
            this.listeners[id](type,data);
        }
    }

    /**
     * Removes all filters from the datastore,
     * More efficient than removing each filter individuallu
     * Filters oo dimnensions with a noclear property will not
     * be removed
     */
    removeAllFilters(){
        this.filterArray.fill(0);
        let noclear=[];
        for (let dim of this.dimensions){     
            if (dim.noclear){
                noclear.push(dim);
                continue
            }
            dim.filterArray.fill(0);
            dim.filterMethod=null;
            if (dim.bgfArray){
                for (let i=0;i<this.size;i++){
                    if  (dim.bgfArray[i]===0){
                        dim.filterArray[i]=2;
                    }                      
                } 
            }
        }  
        this.filterSize=this.size;
        //need to re-add the noclear filters (if any)
        for (let dim of noclear){
            const f= dim.filterArray;
            for (let n=0;n<f.length;n++){
                if (f[n] === 1){
                    if(++this.filterArray[n]===1){
                        this.filterSize--;
                    };

                }
               
            }
        }
        this._callListeners("filtered","all_removed");
    }

    /** 
    * This method should be called if the any data has been modified, specifiying the
    * columns involved.
    * Any dimensions will re-filter if necessary i.e. if the modified columns are 
    * involved in the filter and single filtered event will be broadcast.
    * All 'data_changed' listeners will be informed with the columns changed and whether
    * filtering has already occurred (in which case updating may have already occurred
    * if the object listening to data changes also listens to filtered events)
    * @param {string[]} columns - a list of column/fields whose data has been modified
    * @param {boolean} [is_dirty=true] - if false (default is true) then the column
    * will not be tagged as dirty. This my be the case if the change was pulled from
    * the backend for example 
    */
    dataChanged(columns,is_dirty=true){
        let hasFiltered=false;
        for (let d of this.dimensions){
            //this method will not call any listeners- wait until all done
           if (d.reFilterOnDataChanged(columns)){
                hasFiltered=true;
           }
        }
        if (is_dirty){
            for (let c of columns){
                this.setColumnIsDirty(c);
            }
        }
        //at least one of the dimensions has had to refilter?
        if (hasFiltered){
            this._callListeners("filtered")
        }
        this._callListeners("data_changed",{columns:columns,hasFiltered:hasFiltered});
    }

    /**
     * This method calls any listeners to 'highlight' any rows specified e.g
     * rows in a table or points in a scatter plot
     * @param {array} indexes an array of indexes to items that should be highlighted
     * @param {object} source the obect doing the highlighting
     */
    dataHighlighted(indexes,source){
        this.highightedData=indexes;
        this._callListeners("data_highlighted",{indexes,source});
    }

    /**
     * @returns {array} The indexes of items that have been highligted
     */
    getHighlightedData(){
        return this.highightedData;
    }

    /**
     * Broadcast a filter event to all listeners
     */
    triggerFilter(){
        this._callListeners("filtered")
    }

    /**
    * Tag that the colunm's data has changed and is not synched with the backend
    */
    setColumnIsDirty(col){
        //new column anyway so column already 'dirty'
        if (this.dirtyColumns.added[col]){
            return;
        }
        this.dirtyColumns["data_changed"][col]=true;
    }

    /**
     * Specify that all data (and metadata) has beem synched with
     * the backend
     */
    setAllColumnsClean(){
        this.dirtyColumns.added={};
        this.dirtyColumns.removed={};
        this.dirtyColumns.data_changed={};
        this.dirtyColumns.colors_changed={};
        this.dirtyMetadata.clear();
    }


    /**
    * Returns the current filter, which is just an array corresponding
    * to the index of the row, which contains 0 if it is present or 
    * greater than 0 if it has been filtrered out. Do not modify the array.
    * To check if an row is filtered use {@link DataStore#isRowFiltered} 
    * @returns {Uint8Array} 
    */
    getFilter(){
        return this.filterArray;
    }

    /**
    * Returns true if the row is in the filter and false if it 
    * has been filtered out
    * @param {integer} index The index of the row 
    * @returns {boolean} whether the row has been filtered out
    */
    isRowFiltered(index){
        return this.filterArray[index]===0;
    }


 
    //delete
    _calculateCategories(column){
        let vs = column.values;
        let d= column.data;
        let ci = {};
        for (let n of vs){
            ci[n]=0;
        }
        for (let i=0;i<d.length;i++){
            let v= vs[d[i]];
            ci[v]++;      
        }
    }

    /**
    * Adds a column's metadata and optionally it's data to the DataStore
    * @tutorial datasource
    * @param {Object} column An object describing the column
    * @param {string} column.field - the id of the column - used internally
    * @param {string} column.name -the human readable column label
    * @param {string} column.datatype - the datatype- can be one of 
    * <ul>
    *   <li> double - any floating point data </li>
    *   <li> integer - any integer data </li>
    *   <li> text - data containing strings but with no more than 256 categories </li>
    *   <li> unique - data contianing strings but with many categories </li>
    *   <li> multitext - 
    * </ul>
    * @param {boolean} [column.editable] whether the column's data can be changed
    * @param {boolean} [column.is_url] the column's values will be displayed as links
    * (text and unique columns only)
    * @param {string[]} [column.values] Only required for text columns, where the index
    * of the array should match the value in the data   
    * @param {string[]} [column.colors] - An array of rgb hex colors. In the case of a 
    * text column the colors should match the values. For number columns, the list represents
    * colors that will be interpolated. If not suplied default color pallettes will be 
    * supplied
    * @param {number[]} [column.minMax] the min max values in the column's values 
    * (integer/double only)
    * @param {object} [column.quantiles] an object describing the 0.05,0.01 and 0,001 
    * qunatile ranges (integer/double only)
    * @param {boolean} [column.colorLogScale=false] - if true then the colors will be
    * displayed on a log scale- useful if the dataset contains outliers. Because a symlog
    * scale is used the data can contain 0 and negative values
    * @param {SharedArrayBuffer|Array} [data] In the case of a double/integer (number) column, the array
    * buffer should be the appropriate size to contain float32s. For text it shuold be Uint8
    * and contain numbers corresponding to the indexes in the values parameter. For a column of
    * type unique it should be a JavaScript array. This parameter is optional as the data can
    * be added later see {@link DataStore#setColumnData}
    * @param {boolean} [dirty=false] if true then the store will keep a record that this column has
    * been added and is not permanatly stored in the backend
    */
    addColumn(column,data=null,dirty=false){
        let c  = {
            name:column.name,
            field:column.field,
            datatype:column.datatype,
        }
        if (!c.field){
            c.field=column.name;
        }
        if (column.colors){
            c.colors=column.colors;
        }
        if (column.editable){
            c.editable=true;
        }
        if (column.is_url){
            c.is_url=true;
        }

        if (column.subgroup){
            c.subgroup=column.subgroup;
            c.sgindex= column.sgindex;
            c.sgtype=column.sgtype;
        }
       
        
        if (column.datatype === "text" || column.datatype === "multitext"){
            c.stringLength= column.stringLength;
            c.values = column.values || [`Error: no values for '${c.name}'`];
        }
        else if (column.datatype==="double" || column.datatype ==="integer" ||  column.datatype==="int32"){
            c.colorLogScale=column.colorLogScale;
            c.minMax=column.minMax;
            c.quantiles=column.quantiles;
        }
        else{
            c.stringLength= column.stringLength;
            
        }
        this.columns.push(c);
        this.columnIndex[c.field]=c;
        if (data){
            this.setColumnData(column.field,data)
        }
        if (dirty){
            this.dirtyColumns.added[column.field]=true;
        }
        
    }

    /**
     * This method will return (case insensetive) any values in the column
     * which contain the specified text (unique/text/multitext columns only)
     * @param {*} text - the query value
     * @param {*} column - the column to query
     * @param {*} number  - the maximum number of results to return
     * @returns {object[]} An array of objects with
     * <ul>
     *  <li>value-  the actual text match   </li>
     *  <li>index - for unique columns, the row index and for 
     *   text/multitext its index in the column's values array</li>
     * </ul>
     */
    getSuggestedValues(text,column,number=10){
        const col = this.columnIndex[column];
        const tupper= text.toLowerCase();
        const tlower = text.toUpperCase();
        const matches=[];
        if (col.datatype==="unique"){
            const e = new TextEncoder();
            const bupper= e.encode(tupper);
            const blower= e.encode(tlower);
            const len = text.length;
            const d = col.data;    
            const sl = col.stringLength;
            for (let i = 0;i<d.length-len;i++){
                let match=true;
                for (let a=0;a<len;a++){
                    if (bupper[a]!=d[i+a] && blower[a]!=d[i+a]){
                        match=false;
                        break;
                    }
                }
                if (match){
                    const index = Math.floor(i/sl);
                    const v= this.textDecoder.decode(col.data.slice(index*sl,(index*sl)+sl)).replaceAll("\0","");
                    matches.push({
                        value:v,
                        index:index
                    });
                    if (matches.length>number){
                        break;
                    }          
                }
            }
        }
        else if (col.datatype==="text" || col.datatype==="multitext"){
            const tlength = text.length;
            for (let i=0;i<col.values.length;i++){
                const v = col.values[i];
                let match =true;
                for (let n =0;n<v.length-tlength;n++){
                    let match =true;
                    for (let a=n;a<n<tlength;a++){
                        if (text[n]!==tupper[a] && text[n] !==tlower){
                            match =false;
                            break
                        }
                    }
                    if (match){
                        break;
                    }
                }
                if (match){
                    matches.push({
                        value:v,
                        index:i
                    });
                }
            }
        }
        return matches;
    }

    //for columns where the metadata is not housed locally
    //need to create it from the field name
    addColumnFromField(field){
        const data = field.split("|")
        let g = this.subtypeToGroup[data[0]];
        let sg = null;
        if (!g){
            g= this.subgroups[data[0]];
            sg= g.subgroup;
        }
        else{
            sg =  g.subgroups[data[0]];
        }
        if (!this.columnIndex[field]){
            this.addColumn({
                name:data[1],
                field:field,
                datatype:"double",
                subgroup:sg.name,
                sgindex:data[2],
                sgtype:sg.type
            });
        }
    }




    /**
    * returns a list of column name and fields (which have data) sorted by name 
    * @param {Array|string} [filter] - can be either be a string -'number', 'all' or a column type.
    * Or an array of column types
    * @param {boolean} [addNone=false] if true then an extra object will be added to the list
    * with name 'None' and field '__none__'
    * @returns {Object[]}  An array of objects containing name,field and datatype 
    * properties. The columns are ordered by main columns followed by subgroups. 
    * Each group is ordered alphabetically
    */
    getColumnList(filter=null,addNone=false){
        const columns=[];
        const sgDataSources={};
        const sgs =Object.keys(this.subgroups).map(x=>{
            sgDataSources[x]=[];
            return x;
        
        });
        const f_array = Array.isArray(filter);  
        const has_sgs= sgs.length !== 0;
        for (let f in this.columnIndex){
            const c= this.columnIndex[f];
            if (filter){
                if (f_array){
                    if (filter.indexOf(c.datatype)===-1){
                        continue;
                    }
                }
                else if (filter==="number"){
                    if (c.datatype === "text" || c.datatype==="unique" ||  c.datatype==="multitext" ){
                        continue;
                    }
                }
                else if (filter !=="all" && filter!==c.datatype){
                    continue;
                }
            }
            //subgroup columns separate
            if (has_sgs){
                let has = false;
                for (let s of sgs){
                    if (c.field.startsWith(`${s}|`)){
                        const sg = this.subgroups[s];
                        sgDataSources[s].push({name:c.name,field:c.field,datatype:c.datatype,
                            subgroup:{
                                dataSource:sg.dataSource,
                                name_column:sg.name_column
                            }
                        });
                        has=true
                        break
                    }
                }
                if (has){
                    continue;
                }
            }
            columns.push({name:c.name,field:c.field,datatype:c.datatype})
        }
        let cols =  columns.sort((a,b)=> a.name.localeCompare(b.name));
        if (has_sgs){
            for (let ds in sgDataSources){
                sgDataSources[ds].sort((a,b)=> a.name.localeCompare(b.name));
                cols=cols.concat(sgDataSources[ds]);
            }
        }
        if (addNone){
            cols.push({name:"None",field:"__none__"})
        }
        return cols;
    }

    /**
    * Creates and returns a dimension that it used to filter and group the data
    * @param {string} type - the dimension type , the built in dimensions are 
    * 'category_dimension' for text  columns and 'range_dimension' for number
    * columns
    * @returns {Dimension} A dimension that can be used for grouping/filtering 
    */
    getDimension(type){
        if (! Dimension.types[type]){
            throw(`Adding non existent Dimension: ${type}`);
        }
        const dim =new Dimension.types[type](this);
        this.dimensions.push(dim);
        
        return dim;
    }

    /**
    * Returns an object, representing the row/item containing key/value pairs
    * for all columns. As an object is created, this method is slow,
    * so it is advisable not to use it for many rows at once.
    * @param {integer} index - The index of the row
    * @returns {Object} An object containg key(field)/value pairs. An extra
    * variable 'index' contianing the row index is also added to the object
    */
    getRowAsObject(index,columns){
        if (!columns){
            columns= this.columnsWithData;
        }
        const obj={}
        for (let c of columns){
            const col = this.columnIndex[c];
            let v= col.data[index];
            if (col.datatype==="text"){
                v= col.values[v];
            }
            else if (col.datatype==="double" || col.datatype==="integer" || col.datatype==="int32"){
                if (isNaN(v)){
                    v="missing";
                }
            }
            else if (col.datatype=="multitext"){
                const d= col.data.slice(index*col.stringLength,(index*col.stringLength)+col.stringLength);
                v= Array.from(d.filter(x=>x!=65535)).map(x=>col.values[x]).join(", ")

            }
            else{
                v= this.textDecoder.decode(col.data.slice(index*col.stringLength,(index*col.stringLength)+col.stringLength));
                v= v.replaceAll("\0","");
            }
            obj[c]=v;
        }
        obj["__index__"]=index;
        return obj;
    }

    /**
     * Returns the index of the first filtered item - slow
     * @returns the index of the first filtered iten
     */
    getFirstFilteredIndex(){
        for (let n=0;n<this.size;n++){
            if (this.filterArray[n]===0){
                return n;
            }
        }
    }


    /**
     * Return an array of containing all the filterd values for
     * the specified column - inefficent for large data sets
     * @param {string} column - the column's field.id
     * @returns {string[]|number[]}  An array pf filtered valaues
     */
    getFilteredValues(column){
        const arr =  new Array(this.filterSize);
        let index=0;
        for (let n=0;n<this.size;n++){
            if (this.filterArray[n]===0){
                arr[index]=this.getRowText(n,column);
                index++;
            }    
        }
        return arr;
    }

    /**
    * Returns the value for the given row index and column
    * @param {integer} index - the index of the row,
    * @param {string} column - the columns's field/id
    * @returns {string|number} - the vaule for the given index and field 
    */
    getRowText(index,column){
        //not very efficent
        return this.getRowAsObject(index,[column])[column];
    }

    /**
     * Sets the columns offsets 
     * @param {object} data - information about offset/rotation (should only contain offsets or rotation)
     * @param {string} [data.filter] - if the offsets have a background filter - the value for this filter
     * @param {string} data.group - the group (category) to offset
     * @param {number} [data.rotation] - The amount to rotate (in degrees)
     * @param {number[]} [data.offset] - The x, y offset values
     * @param {boolean} update - update all dependants - default is false
     */
    setColumnOffset(data,update){
        if (!this.offsets){
            throw new Error("Attempting to set offsets but none are specified in config")
        }
        data.filter =data.filter || "all";
        //give default values to this group if it has none
        const o = this.offsets.values;
        let fg = o[data.filter];
        if (!fg){
            fg={};
            o[data.filter]=fg;
        }
        let inf =fg[data.group];
        if (! inf){
            inf={offsets:[0,0],rotation:0};
            fg[data.group]=inf;
        }
        this.updateColumnOffsets(data,data.rotation,update);
        this.dirtyMetadata.add("offsets");
    }


    //gets the rotation origin of the group of points i.e. the center
    _getRotationOrigin(column,group,filter){
        const o = this.offsets;
        const gc= this.columnIndex[column];
        const gv = gc.values.indexOf(group)
        const gd= gc.data;
        const x= this.columnIndex[o.param[0]];
        const y= this.columnIndex[o.param[1]];

        //get background filters if any
        let fv=null;
        let fc= null;
        if (o.background_filter){
            fc = this.columnIndex[o.background_filter];
            fv = fc.values.indexOf(filter)
        }
    
        let mmx=[Number.MAX_VALUE,Number.MIN_VALUE];
        let mmy=[Number.MAX_VALUE,Number.MIN_VALUE];

        for (let n=0;n<this.size;n++){
            if (fc && fc.data[n] !== fv){
                continue;
            }
            if (gd[n]===gv){
                mmx[0]=Math.min(mmx[0],x.originalData[n]);
                mmx[1]=Math.max(mmx[1],x.originalData[n]);
                mmy[0]=Math.min(mmy[0],y.originalData[n]);
                mmy[1]=Math.max(mmy[1],y.originalData[n]);
            }
        }
        const mid= x=>x[0] + (x[1] -x[0])/2;
        return [mid(mmx),mid(mmy)];

    }

    initiateOffsets(){
        const o = this.offsets;
        const x = this.columnIndex[o.param[0]];
        const y= this.columnIndex[o.param[1]];
        //store the original values in the column object
        x.originalData= new Float32Array(x.data);     
        y.originalData= new Float32Array(y.data);
    }


    //gets the offset values
    //single - the only value to offset or rotate otherwise
    //the valuea are obtained from the offsets config
    //rotate true or false- to rotate if not then offset
    _getOffsetValues(single,rotation){
        const o = this.offsets;
        let filterData=null;
        let filterValues = null
        if (o.background_filter){
            const c = this.columnIndex[o.background_filter];
            filterData=c.data;
            filterValues= c.values;
            
        }
        const gc= this.columnIndex[o.groups];
        const values=[];
      
        for (let fv in o.values){
            if (single &&  fv!==single.filter){
                continue;
            }

        
            for (let i in o.values[fv]){
                if (single && i !==single.group){
                    continue;
                }
                let v= o.values[fv][i];
            
                const val={
                    index:gc.values.indexOf(i)
                };
                if (fv!=="all"){
                    val.filterData=filterData;
                    val.filterValue = filterValues.indexOf(fv);
                }

                if (rotation){
                    if (!v.rotation_center){
                        v.rotation_center=this._getRotationOrigin(o.groups,i,fv);
                    }
                    val.rotation_center=[v.rotation_center[0]+v.offsets[0],v.rotation_center[1]+v.offsets[1]];
                    
                }
            
                if (single){
                    if(rotation){
                        val.rotation=single.rotation;
                        v.rotation+=single.rotation;

                    }
                    else{
                        v.offsets[0]+=single.offsets[0];
                        v.offsets[1]+=single.offsets[1];
                        val.offsets=single.offsets;
                    }
                }
                else{
                    if (rotation){
                        val.rotation=v.rotation
                    }
                    else{
                        val.offsets=v.offsets;
                    }
                }
                if (rotation){
                    const radians = (Math.PI / 180) * val.rotation;
                    val.cos = Math.cos(radians);
                    val.sin = Math.sin(radians);
                }
                values.push(val);
            }      
        }        
        return values;
    }

    /**
     * resets the columns offsets to default values
     * @param {sring} [filter] - the filter value - or null if no filter
     * @param {string} group - The group/category to reset
     * @param {boolean} update - whether to inform listeners data has changed 
     */
    resetColumnOffsets(filter,group,update){
        filter= filter || "all";
        const o = this.offsets;
        if (!o){
            throw new Error("Attempting to reset offsets but none are specified in config")
        }
        delete this.offsets.values[filter][group];
        let fc= null;
        let fv =null;
        if (filter !=="all"){
            fc =  this.columnIndex[this.offsets.background_filter];
            fv = fc.values.indexOf(filter);
        }
        const gr =this.getColumnValues(o.groups).indexOf(group);
        const grData= this.columnIndex[o.groups].data;
        const x = this.columnIndex[o.param[0]];
        const y = this.columnIndex[o.param[1]];
     
        for (let n=0;n<this.size;n++){
 
                if (fc && fc[n] !== fv){
                    continue;
                }
                if (grData[n]===gr){
                    y.data[n]=y.originalData[n];
                    x.data[n]=x.originalData[n];
                }        
        }
        if (update){
            this.dataChanged([o.param[0],o.param[1]],false)
        }
        this.dirtyMetadata.add("offsets");
    }
    
    //single - info about the group to rotate/offset
    //if null then all groups will be offset according to the values in offsets
    //rotation -  will rotate rather than translate
    //update - send message to update all dependants
    updateColumnOffsets(single,rotation=false,update=false){
        const o = this.offsets;
        const gc= this.columnIndex[o.groups];
        const groupData=gc.data; 
        const x= this.columnIndex[o.param[0]];
        const y= this.columnIndex[o.param[1]];
        const values  = this._getOffsetValues(single,rotation);
     
        for (let n=0;n<this.size;n++){
         
            for (let v of values){
                if (v.filterData && v.filterData[n] !== v.filterValue){
                    continue;
                }
                if (groupData[n]===v.index){
                    if (rotation){
                        let cx= v.rotation_center[0];
                        let cy = v.rotation_center[1];
                        let nx = (v.cos * (x.data[n] - cx)) + (v.sin * (y.data[n] - cy)) + cx;
                        let ny = (v.cos * (y.data[n] - cy)) - (v.sin * (x.data[n] - cx)) + cy;
                        x.data[n]=nx;
                        y.data[n]=ny;
                    }else{
                        x.data[n]=x.data[n]+v.offsets[0];
                        y.data[n]=y.data[n]+v.offsets[1];

                    }     
                }
            }     
        }
        if (update){
            //update listeners but although column data has changed - don't synch with backend
            this.dataChanged([o.param[0],o.param[1]],false)
        }
    }

    
    /**
    * Gets an object whose keys contains the supplied column's values pointing
    * to the row's index. Only for text and unique columns. Will give unpredictable
    * results if a value is present more than once in the column. 
    * The index is cached, so calling multiple times will not affect performance.
    * @param {string[]} column The column's field/id
    * @returns {object} An object whose keys are the columns values which point
    * to the row's index 
    */
    getColumnIndex(column){
        if (this.indexes[column]){
            return this.indexes[column];
        }
        const col = this.columnIndex[column];
        const index={};
        if (col.datatype==="unique"){
            for (let n=0;n<this.size;n++){
                let v= this.textDecoder.decode(col.data.slice(n*col.stringLength,(n*col.stringLength)+col.stringLength)).replaceAll("\0","");
                //needed for some cell ids
                if (v.includes("#")){
                    v=v.split("#")[1]
                }
                index[v]=n

            }
        }
        else{
            for (let n=0;n<this.size;n++){
                index[col.values[col.data[n]]]=n;
            }

        }
        this.indexes[column]=index;
        return index;
    }


    /**
    * Gets a text file blob of the data which can be downloaded
    * @param {string[]} columns A list of column fields/ids to create the file with
    * @param {string|int[]} rows a value of 'filtered'  will only add filtered rows,
    * alternatively a list of row indexes can be given. Any other value will result
    * @param {string} [delimiter='\t'] The column delimiter to use
    * @param {string} [delimiter='\n'] The newline delimiter default '\n' 
    * @returns {Blob} A data blob which can be downloaded
    */
    getDataAsBlob(columns,rows="all",delimiter="\t",newline="\n"){
        let indexes=null;
        if (typeof rows !== "string"){
            indexes=rows;
        }
        const arr=[];
        const cols=[];
        const headers=["index"].concat(columns);
        for (let c of columns){    
            const col= this.columnIndex[c];
            cols.push(col);
            headers.push(col.name);

        }
        const len =indexes?indexes.length:this.size
        arr.push(headers.join(delimiter));
        for (let i=0;i<len;i++){
            let index= i
            if (indexes){
                index=indexes[i];
            }else{
                if (rows==="filtered" && this.filterArray[i]===1){
                    continue
                }
            }
            const o = this.getRowAsObject(index,columns);
            const line = [i].concat(columns.map(x=>o[x]))
            arr.push(line.join(delimiter))

        }
        return new Blob([arr.join(newline)],{type:"text/plain"})
    }

    /**
    * Adds data to the store for the specified column. If the data is a JavaScript array,
    * then it will be converted to the correct internal data structures and the only previously 
    * supplied metadata required are field, name and datatype.
    * If the data is a shared array buffer then, the data should be in the correct
    * format see [columns]{@tutorial datasource}
    * @param {string}  column - The field/id of the column.
    * @param {SharedArrayBuffer|Array} data  either a javascript array or shared array buffer 
    */
    setColumnData(column,data){
        let c= this.columnIndex[column];
        if (!c){
            throw `column ${column} is not present in data store`
        }
        let buffer = null;
        if (Array.isArray(data)){
            buffer = this._convertColumn(c,data);
        }
        else{
            buffer=data;
        }
        c.buffer=buffer;      
        if (c.datatype === "integer" || c.datatype=="double" || c.datatype==="int32"){
            const dataArray = c.data=  c.datatype==="int32"?new Int32Array(buffer):new Float32Array(buffer);
            if (!c.minMax){
                let min =Number.MAX_VALUE, max = Number.MIN_VALUE;
                for (let i=0;i<dataArray.length;i++){
                    let value = dataArray[i];
                    if (isNaN(value)){
                        continue;
                    }
                    min = (value<min) ? value:min
                    max = (value>max) ? value:max
                }
                c.minMax=[min,max];
            }
            if (!c.quantiles){
                const a  = c.data.filter(x=>!isNaN(x)).sort();
                c.quantiles={};
                for (let q of [0.05,0.01,0.001]){
                    c.quantiles[q]=[quantileSorted(a,q),quantileSorted(a,1-q)];           
                }
            }         
        }
        else if (c.datatype==="multitext"){
            c.data= new Uint16Array(buffer);
        }
        else {
          c.data= new Uint8Array(buffer);
        }
        this.columnsWithData.push(column);      
    }

    //experimental
    appendColumnData(column,data,newSize){
        let c= this.columnIndex[column];
        let arrType= Uint8Array;
        let size = newSize;
        if (c.datatype === "integer" || c.datatype==="double"){
            size=size*4;
            arrType= Float32Array;
        }
        else if ( c.datatype==="int32"){
            size=size*4;
            arrType= Int32Array;
            
        }
        else if (c.datatype==="unique"){
            size=size*c.stringLength;
        }
        
        let newBuffer = new SharedArrayBuffer(size);
        let newArr= new arrType(newBuffer);
        newArr.set(c.data);
        newArr.set(new arrType(data),c.data.length);
        c.data= newArr;
        c.buffer = newBuffer

    }

    //experimental
    addDataToStore(columnData,size){
        const newSize=size+this.size;
        for (let c of columnData){
            this.appendColumnData(c.column,c.data,newSize)
        }
        let newBuffer = new SharedArrayBuffer(newSize);
        let newArr = new Uint8Array(newBuffer);
        newArr.set(this.filterArray);


        this.filterBuffer= newBuffer;
        this.filterArray = newArr;
        this.size = newSize;
        this.filterSize+=size;
        //update dimensions and redo any filters
        for (let d of this.dimensions){
            d.updateSize();
        }
        this._callListeners("data_added",this.size)
    }

    //experimental
    cleanColumnData(column){
        const index= {};
        const col = this.columnIndex[column];
        for (let v in col.values){
            index[v]=0;
        }
        for (let i=0;i<this.size;i++){
            index[col.data[i]]++;
        }
        const newVals=[];
        const oldToNew={};
        for (let i=0;i<col.values.length;i++){
            if (index[i]!==0){
                newVals.push(col.values[i]);
                oldToNew[i]=newVals.length-1;
            }
        }
        for (let i=0;i<this.size;i++){
           col.data[i]=oldToNew[col.data[i]]
        }
        col.values=newVals;
        this.setColumnIsDirty(column);
        this.dataChanged([column]);

      
    }


    //converts a JavaScript array to the intenal data structure (Typed Array)
    //adding any mentadata requires e.g values. stringLength
    _convertColumn(col,arr){
       
        const len =arr.length;
        if (col.datatype==="text"){
            const buff =new SharedArrayBuffer(this.size);
            const v_to_n={}
            for (let i=0;i<len;i++){
                const v= arr[i]
                if (v_to_n[v]=== undefined){
                    v_to_n[v]=1
                }
                else{
                    v_to_n[v]++
                }
            }
            const li=[];
            for (let v in v_to_n){
                li.push([v,v_to_n[v]])
            }
            col.values=[];
            const v_to_i={};
            li.sort((a,b)=>b[1]-a[1]);
            for (let i=0;i<li.length;i++){
                col.values.push(li[i][0]);
                v_to_i[li[i][0]]=i;
            }
           
            const a  = new Uint8Array(buff);
            for (let i=0;i<len;i++){
                a[i]= v_to_i[arr[i]]
            }
            return buff;
        }
        else if (col.datatype === "integer" || col.datatype === "double" || col.datatype==="int32"){
            const buff =new  SharedArrayBuffer(this.size*4);
            const a=  col.datatype==="int32"?new Int32Array(buff):new Float32Array(buff);
           
            for (let i=0;i<len;i++){
                a[i]=arr[i]
            }
            return buff

        }
        else if (col.datatype=== "multitext"){
            let vals = new Set();
            let max=0;
            //first parse - get all possible values and max number
            //of values in a single field
            for (let i=0;i<len;i++){
                const v= arr[i];
                const vs = v.split(",");
                max = Math.max(max,vs.length);
                vs.forEach(x=>vals.add(x.trim()));   
            }
            vals.delete("");
            const buff =new SharedArrayBuffer(this.size*max*2);
            const data = new  Uint16Array(buff);
            data.fill(65535);
            const values= new Array(vals.size);
            //more efficent than using indexOf in array
            const map = {};
            let  index=0;
            for (let v of  vals){
                map[v]=index;
                values[index]=v;
                index++;
            }
           
            for (let i=0;i<len;i++){
               
                const b= i*max;
                const v= arr[i];
                if (v===""){
                    continue;
                }
                const vs = v.split(",");
                vs.sort();
                for (let n=0;n<vs.length;n++){
                    data[b+n]=map[vs[n].trim()];
                }
            }
            col.values=values;
            col.stringLength=max;
            return buff;

        }
        else{
           
            
            let max = 0
            for (let i =0;i<len;i++){
               max= Math.max(max,arr[i].length);
            }
            col.stringLength=max;
            const enc = new TextEncoder();
            const buff =new SharedArrayBuffer(this.size*max);
            for (let i=0;i<len;i++){
                const a= enc.encode(arr[i].substring(0,max));
                const b = new Uint8Array(buff,i*max,max);
                b.set(a,0)
            }
           
            return buff;
        }

    }


    /**
    * Returns a function which gives the appropriate color for the value of
    * the specified column, when supplied with the index of a row/item in the datastore,
    * @param {string} column The column id(field) to use for the function
    * @param {object} [config] An optional config with extra parameters
    * @param {integer} [config.bins=100] For columns with continuous data (doubles/integers),
    * bins are calculated across the data range so that only a limited number of 
    * color values need to be calculated. The default is 100, although it can be 
    * altered here.
    * @param {boolean} [config.asArray=false] By default the, function will return 
    * a JavaScript compatible string specifying the color. If asArray is true then an array 
    * of length 3 containing RGB values will be returned.
    * @param {object} [config.overideValues] an object containing values to use, instead of
    * the columns default values - can include
    * <ul>
    * <li> min - the minumum value </li>
    * <li> max - the maximum value </li>
    * <li> colors - the color scheme to use </li>
    * <li> colorLogScale- whether to use a log scale </li>
    * </ul
    * @param {boolean} [config.useValue=false]  The returned function will require the
    * columns value, not index
    * @returns {function} The function, which when given a row index (or value if this
    * was specified) will return a color.
    */
    getColorFunction(column,config={}){
        const c = this.columnIndex[column];
        const data= c.data;
        const ov = config.overideValues|| {}
        let  colors  =  this.getColumnColors(column,config);
        //simply return the color associated with the value
        if (c.datatype==="text"){                   
            return x=>colors[data[x]];
        }
        else if(c.datatype==="integer" || c.datatype==="double" || c.datatype==="int32"){    
            const min = ov.min==null?c.minMax[0]:ov.min;
            const max = ov.max == null?c.minMax[1]:ov.max;
            const bins = config.bins || 100;
            const interval_size = (max-min)/(bins);
            const fallbackColor = config.asArray?[255,255,255]:"#ffffff";
            //the actual function - bins the value and returns the color for that bin
            if (config.useValue){
                return v=>{
                    if (isNaN(v)){
                        return fallbackColor;
                    }
                    let bin = Math.floor((v - min) / interval_size);
                    if (bin<0){
                        bin=0
                    }
                    else if (bin>=colors.length){
                        bin = colors.length-1;
                    }
                    return colors[bin];
                }

            }else{
                return x=>{
                    const v= data[x];
                    //missing data
                    if (isNaN(v)){
                        return fallbackColor;
                    }
                    let bin = Math.floor((v - min) / interval_size);
                    if (bin<0){
                        bin=0
                    }
                    else if (bin>=colors.length){
                        bin = colors.length-1;
                    }
                    return colors[bin];
                }
            }    
        }
    }

    /**
     * For a given column will returns the given
     * color for that category
     * @param {string} column - the coloumn's field/id
     * @param {string} cat - the category
     * @returns {string} - the hex value of the color
     */
    getColorForCategory(column,cat){
        const c = this.columnIndex[column];
        const i = c.values.indexOf(cat)
        return this.getColumnColors(column)[i];

    }

    /**
     * Makes a color bar/legend based on the give column
     * @param {string} column - the field/id of the column 
     * @param {object} config - see [here]{@link DataStore#getColorFunction} 
     * @returns {HMTLElemnt} - a color bar or color legend
     */
    getColorLegend(column,config={}){
        const colors = this.getColumnColors(column,config);
        const c= this.columnIndex[column];
        const name = config.name || c.name;
        if (c.datatype==="integer" || c.datatype==="double" || c.datatype==="int32"){
            let   range= c.minMaX;
            if (config.overideValues){
                const ov = config.overideValues;
                range = [ov.min==null?c.minMax[0]:ov.min,ov.max==null?c.minMax[1]:ov.max]
            }
            return getColorBar(colors,{range:range,label:name});
        }
        if (c.datatype==="text"){
            return getColorLegend(colors,c.values,{label:name});
        }  
    }

    /**
    * This method returns an object whose keys are categories
    * and values are the colors of the categories
    * @param {string} column The column id(field) (only text/multitext columns)
    * @returns {object} an object of values to colors
    */
     getValueToColor(column){
        const vc={};
        const colors = this.getColumnColors(column);
        const values = this.getColumnValues(column);
        for (let i=0;i<values.length;i++){
            vc[values[i]]=colors[i];
        }
        return vc;

    }

    /**
     * Returns the n and 1-n qauntile values where n is the given percentile
     * If no percentile is passed or is 'all'  than the column's max/min
     * value will be returned
     * @param {string} column - the column's field/id
     * @param {string}  [per] - the percentile - either 0.001.0.01 or 0.05
     * @returns {number[]} - the n and 1-n percentiles
     */
    getColumnQuantile(column,per){
        const col= this.columnIndex[column];
        if (per && per !=="none"){
            if (col.quantiles && col.quantiles !=="NA"){
                return[col.quantiles[per][0],col.quantiles[per][1]];
            }
        }
        else{
            return col.minMax;
        }

    }


    /**
     * Changes the columns current colors
     * @param {string} column - the column's field or id 
     * @param {string[]} colors - the column's new colors
     * @param {booles} [notify=false] - notify any listeners that
     * the data has changed
     */
    setColumnColors(column,colors,notify=false){
        const  c=  this.columnIndex[column];
        if (colors.length !== c.values.length){
            throw new Error(`${column} being set with incorrect number of columns `)
        }
        c.colors= colors.slice(0);
        this.dirtyColumns.colors_changed[column]=true;
        if (notify){
            this.dataChanged([column],false)
        }

    }

    /**
     * Returns the colors that the column uses or default ones if none have been set
     * @param {string} column - the column's field or id
     * @param {object} config - see see [here]{@link DataStore#getColorFunction} 
     * @returns {string[]} An array of colors. For text/multitext, the colors will correspond
     * to the column's values. For double/intgers it will contain binned values fron the min
     * to max value
     */
    getColumnColors(column,config={}){
        const  c=  this.columnIndex[column];
        const rArr= config.asArray;
        if (c.datatype==="double" || c.datatype==="integer" || c.datattype==="int32"){
            const ov = config.overideValues || {};
            const c_colors = ov.colors || (c.colors || defaultIPalette);
            const min = ov.min || c.minMax[0];
            const max =  ov.max ||c.minMax[1];
            //caclulate the color of each bin
            const ls= linspace(min,max,c_colors.length);
            const scale =scaleLinear().domain(ls).range(c_colors).clamp(true);
            const bins = config.bins || 100;
            const interval_size = (max-min)/(bins);
            let colors= new Array(bins+1);   
            for (let i=0;i<bins+1;i++){
                colors[i]=scale(min+(i*interval_size));
                //convert to rgb array
                if (rArr){
                    colors[i]= rgbToRGB(colors[i]);
                }
            }
            let useLog = c.colorLogScale;
            if(ov.colorLogScale!= null){
                useLog= ov.colorLogScale;
            }
            if(useLog){
                //calculate new colors based on a log scale
                const logScale =scaleSymlog().domain([min,max]).range([0,bins]).clamp(true);
                const  newColors= new Array(bins+1);   
                for (let i=0;i<bins+1;i++){
                    newColors[i]=colors[Math.floor(logScale(min+(i*interval_size)))];
                }
                colors=newColors;
            }
            return colors
        }
        else if (c.datatype==="text" || c.datatype==="multitext"){

            let colors=  c.colors;
            if (! colors){
                const vlen = c.values.length;
                const dlen = defaultPalette.length;
                if (vlen<dlen){
                    colors=defaultPalette.slice(0,vlen);
                }
                else{
                    colors=[];
                    const times = Math.floor(vlen/dlen);
                    for (let n=0;n<times;n++){
                        colors=colors.concat(defaultPalette);
                    }
                    colors=colors.concat(defaultPalette.slice(0,vlen%dlen))
                }
            }
            
            if (rArr){
                colors= colors.map(x=>hexToRGB(x));
            }
            return colors;
        }
    }

    
    addColumnGroup(group){
        if (!group.columns){
            group.columns=[];
        }
        this.columnGroups[group.name]=group;

    }

    getColumnGroup(name){
        const cg  =this.columnGroups[name];
        if (!cg){
            return null
        }
        return cg.columns;
    }

    getRawColumn(column){
        return this.columnIndex[column].data;
    }

       
    /**
    * Returns the min/max values for a given column 
    * @param {string} column The column id(field) 
    * @returns {number[]} An array - the first value being the min value and the second the max value
    */
    getMinMaxForColumn(column){
        const c = this.columnIndex[column];
        return c.minMax;
    }
    
    getColumnRange(column){
        const c = this.columnIndex[column];
        if (!c.minMax) {
            console.error('unknown minMax for column ' + column);
            return [0, 50];
        }
        return c.minMax[1]-c.minMax[0];
    }

    getColumnInfo(column){
        const c = this.columnIndex[column];
        return {
            name:c.name,
            field:c.field,
            datatype:c.datatype,
            stringLength:c.stringLength,
            subgroup:c.subgroup,
            sgindex:c.sgindex,
            sgtype:c.sgtype
        }
    }

    getLoadedColumns(){
        return this.columns.filter(x=>x.data!=null).map(x=>x.field);
    }

    getAllColumns(){
        return this.columns.map(x=>x.field);
    }

    getColumnValues(column){
        return this.columnIndex[column].values;
    }


    getColumnName(col){
        const c = this.columnIndex[col];
        return c?c.name:null;
    }

     /**
    * Removes the column and all its data
    * @param {string} column - the columns id/field 
    * @param {boolean} [dirty=false] if true, tags that the column should also be removed from the
    * backend
    * @param {boolean} [notify=false] if true notifies any listeners that the column has been removed
    */

    removeColumn(column,dirty=false,notify=false){
        const c = this.columnIndex[column];
        c.data=null;
        c.buffer=null;
        this.columns= this.columns.filter((c)=>c.field!==column);
        delete this.columnIndex[column];
        const i = this.columnsWithData.indexOf(column);
        if (i!==-1){
            this.columnsWithData.splice(i,1);
        }
        if (dirty){
            //added and removed without saving
            if (this.dirtyColumns.added[column]){
                delete this.dirtyColumns.added[column];
            }
            else{
                this.dirtyColumns.removed[column]=true;
            }
            
        }
        if (notify){
            this._callListeners("column_removed",column)
        }
    }
}

function linspace(start,end,n){
    var out = [];
    var delta = (end - start) / (n - 1);

    var i = 0;
    while(i < (n - 1)) {
        out.push(start + (i * delta));
        i++;
    }

    out.push(end);
    return out;
}

function hexToRGB(hex){
    hex=hex.replace("#","")
    var bigint = parseInt(hex, 16);
    var r = (bigint >> 16) & 255;
    var g = (bigint >> 8) & 255;
    var b = bigint & 255;
    return [r,g,b];
}

function RGBToHex(rgb){
     return "#"+rgb.map(x => {
        const hex = x.toString(16)
        return hex.length === 1 ? '0' + hex : hex
      }).join('');
}
function rgbToRGB(rgb){
    if (!rgb){
        return [255,255,255];
    }
    rgb= rgb.substring(4,rgb.length-1).split(", ");
    return rgb.map(x=>parseInt(x));
}

const defaultPalette=[
	"#377eb8", "#4daf4a", "#984ea3", "#ff7f00", "#ffff33", "#a65628", "#f781bf", "#999999", "#1CE6FF", "#FF34FF",
	"#FF4A46", "#008941", "#676FA6", "#A30059", "#FFDBE5", "#7A4900", "#0000A6", "#63FFAC", "#B79762",
	"#004D43", "#8FB0FF", "#997D87", "#5A0007", "#809693", "#FEFFE6", "#1B4400", "#4FC601", "#3B5DFF", "#4A3B53", "#FF2F80",
"#61615A", "#BA0900", "#6B7900", "#00C2A0", "#FFAA92", "#FF90C9", "#B903AA", "#D16100",
"#DDEFFF", "#000035", "#7B4F4B", "#A1C299", "#300018", "#0AA6D8", "#013349", "#00846F",
"#372101", "#FFB500", "#C2FFED", "#A079BF", "#CC0744", "#C0B9B2", "#C2FF99", "#001E09",
"#00489C", "#6F0062", "#0CBD66", "#EEC3FF", "#456D75", "#B77B68", "#7A87A1", "#788D66",
"#885578", "#FAD09F", "#FF8A9A", "#D157A0", "#BEC459", "#456648", "#0086ED", "#886F4C",
"#34362D", "#B4A8BD", "#00A6AA", "#452C2C", "#636375", "#A3C8C9", "#FF913F", "#938A81",
"#575329", "#00FECF", "#B05B6F", "#8CD0FF", "#3B9700", "#04F757", "#C8A1A1", "#1E6E00",
"#7900D7", "#A77500", "#6367A9", "#A05837", "#6B002C", "#772600", "#D790FF", "#9B9700",
"#549E79", "#FFF69F", "#201625", "#72418F", "#BC23FF", "#99ADC0", "#3A2465", "#922329",
"#5B4534", "#FDE8DC"];

const defaultIPalette=['#3288bd','#66c2a5','#abdda4','#e6f598','#fee08b','#fdae61','#f46d43','#d53e4f']


export default DataStore;
export {hexToRGB,defaultPalette,RGBToHex}