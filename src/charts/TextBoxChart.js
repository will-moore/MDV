import BaseChart from "./BaseChart.js";
import {createEl} from "../utilities/Elements.js";


class TextBoxChart extends BaseChart{
    constructor(dataStore,div,config){
		super(dataStore,div,config);
       
        const c = this.config;
        c.text= c.text || "";
        this.para = createEl("p",{
            text:this.config.text,
            styles:{
                padding:"5px"
            }
        },this.contentDiv);

        
	}

    getSettings(){
        const settings = super.getSettings();
        const c= this.config;
        settings.push({
            label:"Text",
            type:"textbox",
            current_value:c.text,
            func:x=>this.para.textContent=c.text=x
        });
        return settings;
    }

}

export default TextBoxChart;

BaseChart.types["text_box_chart"]={
    "class":TextBoxChart,
    name:"Text Box",
    params:[],
    extra_controls: ()=> [
        {
            type:"richtext",
            name:"text",
        }
    ],
    init:(config, dataSource, extraControls) => {
        config.text = extraControls.text;
    }
}
