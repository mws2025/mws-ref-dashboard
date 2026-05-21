import type { Recipe } from "@/types"

export const RECIPES: Recipe[] = [
  { id:  1, name: "Sugar Cube",    desc: "Changes DT into NC.",                                               cost: { sugar: 1 },                               timing: "Before map"  },
  { id:  2, name: "Sheet Cake",    desc: "+50,000 score.",                                                    cost: { butter: 1, milk: 1 },                     timing: "After score" },
  { id:  3, name: "Sourdough",     desc: "No effect. Just for the love of the game.",                        cost: { flour: 1 },                               timing: "Any"         },
  { id:  4, name: "Sugar Cookies", desc: "Add one mod to a map (own player only).",                          cost: { egg: 1, butter: 1, flour: 1 },            timing: "Before map"  },
  { id:  5, name: "2 Tier Cake",   desc: "+100,000 score.",                                                   cost: { egg: 1, sugar: 1, butter: 1, flour: 1 }, timing: "After score" },
  { id:  6, name: "Custard",       desc: "Both players add one mod to a map.",                               cost: { egg: 1, sugar: 1, butter: 1, flour: 1, milk: 1 }, timing: "Before map" },
  { id:  7, name: "Banana Bread",  desc: "Play map twice, higher top score wins.",                           cost: { egg: 4, sugar: 1, milk: 1 },              timing: "Before map"  },
  { id:  9, name: "Beignets",      desc: "Ban one additional map.",                                          cost: { egg: 2, sugar: 1, butter: 1, flour: 1, milk: 1 }, timing: "Ban phase" },
  { id: 10, name: "3 Tier Cake",   desc: "+200,000 score.",                                                   cost: { egg: 1, sugar: 1, butter: 2, flour: 1, milk: 1 }, timing: "After score" },
  { id: 11, name: "Quiche",        desc: "Force HD on both players for one map.",                            cost: { egg: 3 },                                 timing: "Before map"  },
  { id: 13, name: "Pancakes",      desc: "1.1× scoring for one map.",                                       cost: { flour: 2, milk: 1 },                      timing: "Before map"  },
  { id: 14, name: "Brown Butter",  desc: "Force HR on both players for one map.",                            cost: { butter: 3 },                              timing: "Before map"  },
  { id: 15, name: "Omelette",      desc: "Steal one ingredient from opponent.",                              cost: { egg: 1, butter: 1 },                      timing: "Any"         },
  { id: 16, name: "Bubble Tea",    desc: "Score gap ≤10k → replay the map.",                                cost: { sugar: 2, milk: 1 },                      timing: "After score" },
  { id: 17, name: "Pound Cake",    desc: "Force SD on both players.",                                       cost: { egg: 1, sugar: 2, butter: 1, milk: 1 },  timing: "Before map"  },
  { id: 20, name: "Tiramisu",      desc: "Convert to ScoreV1.",                                              cost: { egg: 2, sugar: 1, flour: 2, milk: 1 },   timing: "Before map"  },
  { id: 21, name: "Caramel",       desc: "Unlock wildcard slot. Winner picks 2 ingredients.",                cost: { sugar: 3 },                               timing: "Pick phase"  },
  { id: 22, name: "Dough",         desc: "Win by >200k → gain ingredient, remove 1 from opponent.",         cost: { flour: 3 },                               timing: "Before map"  },
  { id: 23, name: "Hot Chocolate", desc: "Gain home base ingredient on your next pick.",                     cost: { milk: 3 },                                timing: "Pick phase"  },
  { id: 24, name: "Shortbread",    desc: "≥2 pts behind: win next map → gain 2 ingredients instead of 1.", cost: { egg: 1, flour: 1 },                       timing: "Before map"  },
]
