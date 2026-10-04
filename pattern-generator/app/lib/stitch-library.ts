export type Terminology = "UK" | "US";

export type StitchCategory =
  | "Classic & Beginner"
  | "Texture"
  | "Pattern & Movement"
  | "Open & Lace"
  | "Colourwork";

export type StitchRecipe = {
  id: string;
  name: string;
  category: StitchCategory;
  description: string;
  difficulty: "Beginner" | "Intermediate";
  uk: string;
  us: string;
  foundation: { multiple: number; add: number };
  turningChain: string;
  preview: "plain" | "moss" | "granny" | "block" | "v" | "shell" | "waffle";
  implemented: true;
};

export const STITCH_LIBRARY: StitchRecipe[] = [
  { id:"plain", name:"Plain", category:"Classic & Beginner", description:"Simple even rows for a clean, dependable blanket fabric.", difficulty:"Beginner", uk:"dc", us:"sc", foundation:{multiple:1,add:1}, turningChain:"2", preview:"plain", implemented:true },
  { id:"moss", name:"Moss / Linen", category:"Classic & Beginner", description:"A woven-looking fabric made with UK double crochet and chain-1 spaces worked into the spaces on the row below.", difficulty:"Beginner", uk:"dc", us:"sc", foundation:{multiple:2,add:1}, turningChain:"2", preview:"moss", implemented:true },
  { id:"lemon-peel", name:"Lemon Peel", category:"Classic & Beginner", description:"Alternating short and tall stitches create a subtle pebbled texture.", difficulty:"Beginner", uk:"dc/tr", us:"sc/dc", foundation:{multiple:2,add:1}, turningChain:"1", preview:"plain", implemented:true },
  { id:"granny-stripe", name:"Granny Stripe", category:"Classic & Beginner", description:"Classic three-stitch clusters worked into spaces for a traditional blanket look.", difficulty:"Beginner", uk:"tr", us:"dc", foundation:{multiple:3,add:2}, turningChain:"3", preview:"granny", implemented:true },
  { id:"block", name:"Block Stitch", category:"Classic & Beginner", description:"Open blocks built from half-trebles, chain-1 spaces and groups of three trebles.", difficulty:"Beginner", uk:"htr/tr", us:"hdc/dc", foundation:{multiple:2,add:0}, turningChain:"3", preview:"block", implemented:true },
  { id:"v-stitch", name:"V-Stitch", category:"Classic & Beginner", description:"Open V-shaped groups give a light, airy fabric with clear repeating spaces.", difficulty:"Beginner", uk:"tr", us:"dc", foundation:{multiple:3,add:2}, turningChain:"3", preview:"v", implemented:true },
  { id:"shell", name:"Shell Stitch", category:"Classic & Beginner", description:"Five trebles worked into one stitch form fan-shaped shells, with the shells offset on alternating rows.", difficulty:"Beginner", uk:"tr", us:"dc", foundation:{multiple:6,add:2}, turningChain:"3", preview:"shell", implemented:true },
  { id:"waffle", name:"Waffle Stitch", category:"Texture", description:"Alternating front-post and plain stitches create the deep raised ridges of classic waffle fabric.", difficulty:"Intermediate", uk:"tr/fptr", us:"dc/fpdc", foundation:{multiple:3,add:2}, turningChain:"2", preview:"waffle", implemented:true },
];

export const STITCH_CATEGORIES: StitchCategory[] = [
  "Classic & Beginner",
  "Texture",
  "Pattern & Movement",
  "Open & Lace",
  "Colourwork",
];

export function getStitchRecipe(id: string) {
  return STITCH_LIBRARY.find((recipe) => recipe.id === id);
}

export function stitchAbbr(recipe: StitchRecipe, terminology: Terminology) {
  return terminology === "UK" ? recipe.uk : recipe.us;
}
