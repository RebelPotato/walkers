/*
TODO: 
  novelty search
  rain of stones 
*/
config = {
  motor_noise: 0.005,
  time_step: 60,
  simulation_fps: 60,
  draw_fps: 60,
  velocity_iterations: 8,
  position_iterations: 3,
  max_zoom_factor: 130,
  min_motor_speed: -2,
  max_motor_speed: 2,
  population_size: 20,
  mutation_chance: 0.05,
  mutation_amount: 0.1,
  walker_health: 3000,
  check_health: true,
  elite_clones: 1,
  max_floor_tiles: 50,
  round_length: 50000,
  min_body_delta: 1.4,
  min_leg_delta: 0.4,
  instadeath_delta: 0.4,
  lazer_set: true,
  lazer_speed: 0.00025,
  elite_rate: 0.382
};

globals = {};

gameInit = function() {
  interfaceSetup();

  globals.world = new b2.World(new b2.Vec2(0, -10));
  globals.walkers = createPopulation();

  globals.floor = createFloor();
  drawInit();
  globals.lazer_x = -2;
  globals.step_counter = 0;
  globals.simulation_interval = setInterval(simulationStep, Math.round(1000/config.simulation_fps));
  globals.draw_interval = setInterval(drawFrame, Math.round(1000/config.draw_fps));
}

simulationStep = function() {
  globals.world.Step(1/config.time_step, config.velocity_iterations, config.position_iterations);
  globals.world.ClearForces();
  populationSimulationStep();
  if(typeof globals.step_counter == 'undefined') {
    globals.step_counter = 0;
  } else {
    globals.step_counter++;
  }
  globals.lazer_x += config.lazer_speed * Math.pow(globals.step_counter, 0.618);
  document.getElementById("generation_timer_bar").style.width = (100*globals.step_counter/config.round_length)+"%";
  if(globals.step_counter > config.round_length) {
    nextGeneration();
  }
}

setSimulationFps = function(fps) {
  config.simulation_fps = fps;
  clearInterval(globals.simulation_interval);
  if(fps > 0) {
    globals.simulation_interval = setInterval(simulationStep, Math.round(1000/config.simulation_fps));
    if(globals.paused) {
      globals.paused = false;
      if(config.draw_fps > 0) {
        globals.draw_interval = setInterval(drawFrame, Math.round(1000/config.draw_fps));
      }
    }
  } else {
    // pause the drawing as well
    clearInterval(globals.draw_interval);
    globals.paused = true;
  }
}

createPopulation = function(genomes) {
  setQuote();
  if(typeof globals.generation_count == 'undefined') {
    globals.generation_count = 0;
  } else {
    globals.generation_count++;
  }
  updateGeneration(globals.generation_count);
  var walkers = [];
  for(var k = 0; k < config.population_size; k++) {
    if(genomes && genomes[k]) {
      walkers.push(new Walker(globals.world, genomes[k]));
    } else {
      walkers.push(new Walker(globals.world));
    }
    //No more elites!
    // if(globals.generation_count > 0 && k < config.elite_clones) {
    //   walkers[walkers.length - 1].is_elite = true;
    // } else {
       walkers[walkers.length - 1].is_elite = false;
    // }
  }
  return walkers;
}

populationSimulationStep = function() {//snapshot every 10 health points
  var dead_dudes = 0;
  for(var k = 0; k < config.population_size; k++) {
    if(globals.walkers[k].health > 0) {
      globals.walkers[k].simulationStep(config.motor_noise);
    } else {
      if(!globals.walkers[k].is_dead) {
        for(var l = 0; l < globals.walkers[k].bodies.length; l++) {
          if(globals.walkers[k].bodies[l]) {
            globals.world.DestroyBody(globals.walkers[k].bodies[l]);
            globals.walkers[k].bodies[l] = null;
          }
        }
        globals.walkers[k].is_dead = true;
      }
      dead_dudes++;
    }
  }
  printNames(globals.walkers);
  if(dead_dudes >= config.population_size) {
    nextGeneration();
  }
}

nextGeneration = function() {
  if(globals.simulation_interval)
    clearInterval(globals.simulation_interval);
  if(globals.draw_interval)
    clearInterval(globals.draw_interval);
  getInterfaceValues();
  var genomes = createNewGenerationGenomes();
  killGeneration();
  globals.walkers = createPopulation(genomes);
  resetCamera();
  globals.lazer_x = -2;
  globals.step_counter = 0;
  globals.simulation_interval = setInterval(simulationStep, Math.round(1000/config.simulation_fps));
  if(config.draw_fps > 0) {
    globals.draw_interval = setInterval(drawFrame, Math.round(1000/config.draw_fps));
  }
}

killGeneration = function() {
  for(var k = 0; k < globals.walkers.length; k++) {
    for(var l = 0; l < globals.walkers[k].bodies.length; l++) {
      if(globals.walkers[k].bodies[l])
        globals.world.DestroyBody(globals.walkers[k].bodies[l]);
    }
  }
}

compareWalker = function(a,b) {
  var x = 0;
  if(a.behavior[a.behavior.length-1].distance < b.behavior[b.behavior.length-1].distance){
    if(x == -1) return 0;
    x = 1;
  }
  if(a.behavior[a.behavior.length-1].distance > b.behavior[b.behavior.length-1].distance){
    if(x == 1) return 0;
    x = -1;
  }
  if(a.score < b.score){
    if(x == -1) return 0;
    x = 1;
  }
  if(a.score > b.score){
    if(x == 1) return 0;
    x = -1;
  }
  return x;
}

createNewGenerationGenomes = function() {
  globals.walkers.sort(function(a,b) {
    return b.score - a.score;
  });
  if(typeof globals.last_record == 'undefined') {
    globals.last_record = 0;
  }
  if(globals.walkers[0].score > globals.last_record) {
    printChampion(globals.walkers[0]);
    globals.last_record = globals.walkers[0].score;
  }
  var genomes = [];
  var dist = [];    //later used for novelty search
  var dom_map = [];   //a map of the dominance
  var dom_num = [];   //the number of dominant parents
  for(var i = 0; i < config.population_size; i++){
    dom_map[i] = [];
    dom_num[i] = 0;
  }
  for(var i = 0; i < config.population_size; i++){
    for(var j = i + 1; j < config.population_size; j++){
      var k = compareWalker(globals.walkers[i], globals.walkers[j]);
      // if(k!=0) console.log("Yes!");
      if(k==-1) dom_map[i].push(j), dom_num[j]++;
      if(k==1) dom_map[j].push(i), dom_num[i]++;
    }
  }
  var dom_queue = [];   //queue, for the BFS
  var layer_num = [];   //number of layers for every walker
  var processed_layer = 0;    //the id of the layer being processed
  var tmp_walkers = [];    //the walkers of the layer
  var tmp_all_walkers = [];   //all the walkers of the previous round
  for(var i = 0; i < config.population_size; i++){
    if(dom_num[i] == 0) dom_queue.push(i);
    layer_num[i] = 0;
  }
  while(1){
    var walker_head = dom_queue.shift();
    console.log(walker_head);
    if(typeof walker_head == 'undefined' || layer_num[walker_head] > processed_layer){//deal with the undef problem later
      //now begins the insertion of the last layer into the genome
      if(typeof walker_head == 'undefined') break;
      console.log("Current layer: "+processed_layer);
      var num_res = Math.ceil((config.population_size - genomes.length) * config.elite_rate);
      console.log("It has "+num_res+" remaining");
      for(var k = 0; k < config.elite_clones; k++){
        if(num_res >= tmp_walkers.length){
          for(var i = 0; i < tmp_walkers.length; i++){
            genomes.push(copulate(tmp_walkers[i],tmp_walkers[i]));
          }
          num_res -= tmp_walkers.length;
        }
        else break;
      }
      while(num_res > 0){
        var i = Math.floor(Math.random() * tmp_all_walkers.length);
        var j = Math.floor(Math.random() * tmp_all_walkers.length);
        genomes.push(copulate(tmp_all_walkers[i],tmp_all_walkers[j]));
        num_res--;
      }
      tmp_walkers = [];
      processed_layer++;
      if(config.population_size == genomes.length) break;
    }
    tmp_walkers.push(globals.walkers[walker_head]);
    tmp_all_walkers.push(globals.walkers[walker_head]);
    while(dom_map[walker_head].length > 0){
      var j = dom_map[walker_head].pop();
      dom_num[j]--;
      layer_num[j] = Math.max(layer_num[j], layer_num[walker_head] + 1);
      if(dom_num[j] == 0) dom_queue.push(j);
    }
  }
//   // clones
//   for(var k = 0; k < config.elite_clones; k++) {
//     genomes.push(globals.walkers[k].genome);
//   }
//   for(var k = config.elite_clones; k < config.population_size; k++) {
//     if(parents = pickParents()) {
//       genomes.push(copulate(globals.walkers[parents[0]], globals.walkers[parents[1]]));
//     }
//   }
// //  genomes = mutateClones(genomes);
  return genomes;
}

pickParents = function() {
  var parents = [];
  for(var k = 0; k < config.population_size; k++) {
    if(Math.random() < (1/(k+2))) {
      parents.push(k);
      if(parents.length >= 2) {
        break;
      }
    }
  }
  if(typeof parents[0] == 'undefined' || typeof parents[1] == 'undefined') {
    return false;
  }
  return parents;
}

mutate_num = function(x){
  return x * (1 + config.mutation_amount*(Math.random()*2 - 1)) + config.mutation_amount*(Math.random()*2 - 1);
}

copulate = function(walker_1, walker_2) {
  var new_genome = [];
  for(var k = 0; k < walker_1.genome.length; k++) {
    if(Math.random() < 0.5) {
    // if(Math.random() < walker_1.score / (walker_1.score + walker_2.score)) {      //temporary hack for no good choosing
      var parent = walker_1;
    } else {
      var parent = walker_2;
    }
    var new_gene = JSON.parse(JSON.stringify(parent.genome[k]));
    new_gene.xweight = mutate_num(new_gene.xweight);
    new_gene.yweight = mutate_num(new_gene.yweight);
    for(var i = 0; i < walker_1.genome.length; i++){
      new_gene.weight[i] = mutate_num(new_gene.weight[i]);
    }
    new_genome[k] = new_gene;
  }
  return new_genome;
}

getInterfaceValues = function() {
  config.elite_clones = document.getElementById("elite_clones").value;
  config.mutation_chance = document.getElementById("mutation_chance").value;
  config.mutation_amount = document.getElementById("mutation_amount").value;
  config.motor_noise = parseFloat(document.getElementById("motor_noise").value);
  config.lazer_speed = parseFloat(document.getElementById("lazer_speed").value);
}