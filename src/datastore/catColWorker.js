



onmessage= function(e){  
    const data= [];
    for (let item of e.data[3]){
        data.push(item[1]==="int32"?new int32Array(item[0]):new Float32Array(item[0]))
    }
    const dLen= data.length
    const cat= new Uint8Array(e.data[2]);
    const config = e.data[4];
    const  len = cat.length;
    let valLen = config.values.length;
    const scaleVals = config.scaleVals;
  
    const lFilter=new  Uint8Array(e.data[0]);
    const gFilter = new  Uint8Array(e.data[1]);
    let result = new Array(dLen);
    for (let n=0;n<dLen;n++){
        const arr =  new Array(valLen);
        for (let i=0;i<valLen;i++){
            arr[i]= config.method==="mean"?[0,0]:[0,0,0];
        }
        result[n] =arr;
        //list may get sorted
        result[n]._id=n;

    }
    const catTotals= new Array(valLen).fill(0);
    if (config.method==="mean"){
        addAverages(result,data,len,dLen,gFilter,lFilter,cat,catTotals,valLen,scaleVals);
    }
    else{
        addMedians(result,data,len,dLen,gFilter,lFilter,cat,catTotals,valLen,scaleVals);
    }
    

   
    const indexR=[];
    
    for(let n=0;n<valLen;n++){
        if (catTotals[n]!==0){
            indexR.push(n);
        }
    }

    
    for(let n=0;n<dLen;n++){
        result[n] =result[n].filter((x,i)=>catTotals[i]!==0)
        result[n]._id=n;
    }
    
  
    valLen= indexR.length;

    const transpose=new Array(valLen);
    for (let i=0;i<valLen;i++){
        transpose[i] = new Array(dLen);
        transpose[i]._id=indexR[i];
        for (let n=0;n<dLen;n++){
            transpose[i][n]=isNaN(result[n][i])?0:result[n][i];
        }
    }   
    postMessage({averages:result,transpose:transpose,catTotals:catTotals});
}


function addMedians(result,data,len,dLen,gFilter,lFilter,cat,catTotals,valLen,scaleVals){
    
    let t= performance.now();
    for (let i=0;i<len;i++){
        //if filtered out in global but not in local
        if (gFilter[i]!==0){
            if  (gFilter[i] !==lFilter[i]){
            continue;
            }           
        }
        let c= cat[i];
        catTotals[c]++;
        for (let n=0;n<dLen;n++){
            if (isNaN(data[n][i])){
                continue;
            }
            result[n][c][0]++;
         
        }
    }
    
    for (let n=0;n<dLen;n++){

        for(let i=0;i<valLen;i++){
            if (result[n][i][0]){
                result[n][i][1]= new Float32Array(result[n][i][0]);
            }
           
        }
    
    
    } 
    for (let i=0;i<len;i++){
        //if filtered out in global but not in local
        if (gFilter[i]!==0){
            if  (gFilter[i] !==lFilter[i]){
            continue;
            }           
        }
        let c= cat[i];
        for (let n=0;n<dLen;n++){
            if (isNaN(data[n][i])){
                continue;
            }
            const a = result[n][c];
         
            a[1][a[2]++]=data[n][i];    
        }
    }
    

    for (let n=0;n<dLen;n++){

        const den = scaleVals[n][1]-scaleVals[n][0]; 
        for(let i=0;i<valLen;i++){   
              
            let a =result[n][i];
            const li =a[1];
            if (!li){
                result[n][i]=NaN;
                continue;
            } 
            li.sort();
            let r = li[Math.floor(li.length/2)];
            r=(r-scaleVals[n][0])/den;
            result[n][i]= r<0?0:r>1?1:r;          
        }
    }
   

}


function addMedianst(result,data,len,dLen,gFilter,lFilter,cat,catTotals,valLen,scaleVals){
    
    let t= performance.now();
    for (let i=0;i<len;i++){
        //if filtered out in global but not in local
        if (gFilter[i]!==0){
            if  (gFilter[i] !==lFilter[i]){
            continue;
            }           
        }
        let c= cat[i];
        catTotals[c]++;
        for (let n=0;n<dLen;n++){
            if (isNaN(data[n][i])){
                continue;
            }
            result[n][c].push(data[n][i]);
         
        }
    }

    for (let n=0;n<dLen;n++){

        const den = scaleVals[n][1]-scaleVals[n][0]; 
        for(let i=0;i<valLen;i++){   
              
            let li =result[n][i];
            if (li.length===0){
                result[n][i]=NaN;
                continue;
            } 
            li.sort();
            let r = li[Math.floor(li.length/2)];
            r=(r-scaleVals[n][0])/den;
            result[n][i]= r<0?0:r>1?1:r;          
        }
    }
   

}


function addAverages(result,data,len,dLen,gFilter,lFilter,cat,catTotals,valLen,scaleVals){
    for (let i=0;i<len;i++){
        //if filtered out in global but not in local
        if (gFilter[i]!==0){
            if  (gFilter[i] !==lFilter[i]){
            continue;
            }           
        }
        let c= cat[i];
        catTotals[c]++;
        for (let n=0;n<dLen;n++){
            if (isNaN(data[n][i])){
                continue;
            }
            const a= result[n][c];
            a[0]+=data[n][i];
            a[1]++;
        }
    }
    for (let n=0;n<dLen;n++){
        const den = scaleVals[n][1]-scaleVals[n][0];
        for(let i=0;i<valLen;i++){        
            let val =result[n][i];
            let r = val[0]/val[1];
            r=(r-scaleVals[n][0])/den;
            result[n][i]= r<0?0:r>1?1:r
        }
    }

}