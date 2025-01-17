import {select} from "d3-selection";
import {easeLinear} from "d3-ease";
import CategoryChart from "./CategoryChart.js";
import BaseChart from "./BaseChart.js";

class RowChart extends CategoryChart{
    constructor(dataStore,div,config){
		super(dataStore,div,config,{x:{}});
        this.config.type = "row_chart";
        //redraw the chart
        this.onDataFiltered(null);
        this.labelg = this.graph_area.append("g");
	}

    drawChart(tTime=400){
        const c = this.config;
        const trans =  select(this.contentDiv).transition()
        .duration(tTime).ease(easeLinear);
        const chartWidth= this.width-this.margins.left-this.margins.right;
        const chartHeight = this.height-this.margins.bottom- this.margins.top;
      
        const colors = this.dataStore.getColumnColors(this.config.param); 
        const vals = this.dataStore.getColumnValues(this.config.param);
        
       
        const units = chartWidth/this.maxCount;
        const self = this;
        let  data = this.rowData;
        let maxCount = this.maxCount;
  
        if (c.exclude_categories){
            const ex = new Set()
            for (let n of c.exclude_categories){
                ex.add(vals.indexOf(n))
            }
            data= this.rowData.filter((x,i)=>!ex.has(i));
            maxCount= data.reduce((a,b)=>Math.max(a[0],b[0]))
        }

        
        const nBars = data.length;
       
        const barHeight= (chartHeight-(nBars+1)*3)/nBars;

        let fontSize = Math.round(barHeight);
        fontSize=fontSize>20?20:fontSize;

        this.x_scale.domain([0,this.maxCount]);
        this.updateAxis();

        this.labelg.selectAll(".row-bar")
        .data(data, d=>d[1])
        .join("rect")
        .attr("class","row-bar")
        .on("click",(e,d)=>{
            self.filterCategories(vals[d[1]],e.shiftKey);
        })
        .transition(trans)
        .style("fill",(d)=>{
            const i = d[1];
            if (self.filter.length>0){
                if (self.filter.indexOf(vals[i])===-1){
                    return "lightgray"
                }
            }
            return colors[i];
          
        })
        .attr("class","row-bar")
        .attr("x",0)
        .attr("width",d=>d[0]*units)
        .attr("y",(d,i)=>((i+1)*3)+(i*barHeight))
        .attr("height",barHeight)
    

        this.graph_area.selectAll(".row-text")
        
        .data(data,d=>d[1])
        .join("text")
        .on("click",(e,d)=>{
            self.filterCategories(vals[d[1]],e.shiftKey);
        })
        .attr("class","row-text")
        .transition(trans)
        .text((d)=>vals[d[1]]===""?"none":vals[d[1]])
        .attr("font-size",fontSize+"px")
        .attr("x",5)
        .style("fill","currentColor")
        .attr("y",(d,i)=>((i+1)*3)+(i*barHeight)+(barHeight/2))
        //.attr("text-anchor", "middle")
        .attr("dominant-baseline", "central") 

    }

    getSettings(){

   
        const settings= super.getSettings();
        const c = this.config;
        const max =Math.max(this.data.length || 60)

        return settings.concat([
            {
                type:"spinner",
                label:"Max Rows",
                current_value:c.show_limit || max,
                max:max,
                func:x=>{
                    c.show_limit=x;
                    this.updateData();
                    this.drawChart();
                }
            },
            {
                type:"check",
                label:"Hide zero values",
                current_value:c.filter_zeros,
                func:x=>{
                    c.filter_zeros=x;
                    this.updateData();
                    this.drawChart();
                }
            },
            {
                type:"radiobuttons",
                label:"Sort Order",
                current_value:c.sort || "default",
                choices:[["Default","default"],["Size","size"],["Name","name"]],             
                func:(v)=>{
                    c.sort=v;
                    this.updateData();
                    this.drawChart();      
                }
            }
        ])
    }
}

BaseChart.types["row_chart"]={
    "class":RowChart,
    name:"Row Chart",
    params:[{
        type:["text","multitext"],
        name:"Category"
    }]

}

export default RowChart;