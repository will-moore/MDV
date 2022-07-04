



onmessage= function(e){
    const config = e.data[3];
    const data= new Uint8Array(e.data[2]);
    const lFilter=new  Uint8Array(e.data[0]);
    const gFilter = new  Uint8Array(e.data[1]);
    let result = null;
    if (config.method==="sankey"){
        const data2= new Uint8Array(e.data[4]);
        result = getSankeyData(lFilter,gFilter,data,data2,config)
    }
    else if (config.method==="proportion"){
        const data2= new Uint8Array(e.data[4]);
     
        result = getProportionData(lFilter,gFilter,data,data2,config);
    }
    else{     
        result =getNumberInCategory(lFilter,gFilter,data,config)
    }
    postMessage(result);
}

//data the x category (groups) 
function getProportionData(lFilter,gFilter,data,data2,config){
    const len1 = config.values.length;
    const len2 = config.values2.length;
    const data3 = config.cats?new Uint8Array(config.cats):null;
    const len = data.length;
    const counts = new Array(len1);
    const totals = config.diviser?config.diviser:new Array(len1);
    for (let n=0;n<len1;n++){
        counts[n]=new Array(len2).fill(0);
        totals[n]=new Array(len2).fill(0);
    }
    const cat = config.category;
    let total=0;
    for (let i=0;i<len;i++){
        //if filtered out in global but not in local       
        totals[data[i]][data2[i]]++;    
        if ( gFilter[i]===0){
            if (data3 && data3[i]!==cat){
                continue;
            }
            counts[data[i]][data2[i]]++;
            total++;     
        }
    }
    let t_max=0;
    let t_min=10000000;
    for (let i =0;i<totals.length;i++){     
        const  t = totals[i];
        const c= counts[i];
        const nc=[];
        const vls = [];
        let total=0;
        let max=0;
        let min=10000000;
        for (let n=0;n<t.length;n++){
            if (t[n]===0){
                continue;
            }
            const v= config.denominators?c[n]/config.denominators[n]:(c[n]/t[n])*100;
            nc.push([v,i,n,Math.floor(Math.random()*6)]);
            vls.push(v);
            total+=v;
            max=Math.max(max,v);
            min = Math.min(min,v);
        }
        
        nc.av= total/nc.length;
        nc.std = std(vls,nc.av);
        nc.max=max;
        nc.min=min;
        counts[i]=nc
        t_max=Math.max(t_max,max);
        t_min = Math.min(t_min,min);
    }
    counts.max=t_max;
    counts.min=t_min;
    return counts;
}



function getNumberInCategory(lFilter,gFilter,data,config){
    const cats = new Array(config.values.length).fill(0);
    const  len = data.length;
    for (let i=0;i<len;i++){
        //if filtered out in global but not in local
        if (gFilter[i]!==0){
            if  (gFilter[i] !==lFilter[i]){
            continue;
            }           
        }
        cats[data[i]]++;
    }
    return cats;

}


function getSankeyData(lFilter,gFilter,data,data2,config){
    const len1 = config.values.length;
    const len2 = config.values2.length;
    const len = data.length;
    const matrix = new Array(len1);
    const nodes1= config.values.map((x,i)=>{
        return "A"+i;
    });
    const nodes2= config.values2.map((x,i)=>{
        return"B"+i;
    });



    for (let n=0;n<len1;n++){
        matrix[n]=new Array(len2).fill(0);
    }
    const links= [];
    let total=0;
    for (let i=0;i<len;i++){
        //if filtered out in global but not in local
        if (gFilter[i]!==0){
            if  (gFilter[i] !==lFilter[i]){
                continue;
            }           
        }
        matrix[data[i]][data2[i]]++;
        total++;
    }
    
    const nodes1Used=new Set();
    const nodes2Used=new Set()
    const minValue =Math.round(total/300);

    for (let i1 =0;i1<len1;i1++){
        for (let i2 = 0;i2<len2;i2++){
            const v = matrix[i1][i2];
            if (v!==0){
                nodes1Used.add(nodes1[i1]);
                nodes2Used.add(nodes2[i2]);
                links.push({source:nodes1[i1],target:nodes2[i2],value:v<minValue?minValue:v,trueValue:v})
            }
            
        }
    }
    const minNodes = Math.min(nodes1Used.size,nodes2Used.size);
    const n1 = Array.from(nodes1Used).map(x=>{
        return {id:x,ind:x.substring(1),param:0};
    })
    const n2 = Array.from(nodes2Used).map(x=>{
        return {id:x,ind:x.substring(1),param:1};
    })

    return {
        links:links,
        nodes:n1.concat(n2),
        minNodes:minNodes
    }
}

function std(arr,av){
    let n=arr.length-1;
    n=n===0?1:n;
    let std = arr.reduce((prev,cur)=>prev+(Math.pow(cur-av,2)),0);
    return Math.sqrt(std/n);

}