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
  { id:"plain", name:"Plain", category:"Classic & Beginner", description:"Simple even rows for a clean, dependable blanket fabric.", difficulty:"Beginner", uk:"dc", us:"sc", foundation:{multiple:1,add:1}, turningChain:"1", preview:"plain", implemented:true },
  { id:"moss", name:"Moss / Linen", category:"Classic & Beginner", description:"A woven-looking fabric made with single crochet and chain-1 spaces.", difficulty:"Beginner", uk:"dc", us:"sc", foundation:{multiple:2,add:1}, turningChain:"1", preview:"moss", implemented:true },
  { id:"lemon-peel", name:"Lemon Peel", category:"Classic & Beginner", description:"Alternating short and tall stitches create a subtle pebbled texture.", difficulty:"Beginner", uk:"dc/tr", us:"sc/dc", foundation:{multiple:2,add:1}, turningChain:"1", preview:"plain", implemented:true },
  { id:"granny-stripe", name:"Granny Stripe", category:"Classic & Beginner", description:"Classic three-stitch clusters worked into spaces for a traditional blanket look.", difficulty:"Beginner", uk:"tr", us:"dc", foundation:{multiple:3,add:2}, turningChain:"3", preview:"granny", implemented:true },
  { id:"block", name:"Block Stitch", category:"Classic & Beginner", description:"Colourful blocks formed from clusters and single stitches.", difficulty:"Beginner", uk:"tr/dc", us:"dc/sc", foundation:{multiple:3,add:2}, turningChain:"3", preview:"block", implemented:true },
  { id:"v-stitch", name:"V-Stitch", category:"Classic & Beginner", description:"Open V-shaped groups give a light, airy fabric with clear repeating spaces.", difficulty:"Beginner", uk:"tr", us:"dc", foundation:{multiple:3,add:2}, turningChain:"3", preview:"v", implemented:true },
  { id:"shell", name:"Shell Stitch", category:"Classic & Beginner", description:"Fan-shaped groups create a decorative textured fabric.", difficulty:"Beginner", uk:"tr", us:"dc", foundation:{multiple:6,add:1}, turningChain:"3", preview:"shell", implemented:true },
  { id:"waffle", name:"Waffle Stitch", category:"Texture", description:"Raised front- and back-post stitches create the distinctive deep waffle texture.", difficulty:"Intermediate", uk:"tr/fptr/bptr", us:"dc/fpdc/bpdc", foundation:{multiple:3,add:2}, turningChain:"3", preview:"waffle", implemented:true },
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
