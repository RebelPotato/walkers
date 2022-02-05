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
  population_size: 25,
  mutation_chance: 0.05,
  mutation_amount: 0.1,
  walker_health: 3000,
  check_health: true,
  elite_clones: 12,
  max_floor_tiles: 50,
  round_length: 50000,
  min_body_delta: 1.4,
  min_leg_delta: 0.4,
  instadeath_delta: 0.4,
  lazer_set: true,
  lazer_speed: 0.00025,
  snap_shot_time: 10,
  niche_size: 5
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
    if(globals.generation_count > 0 && k < config.elite_clones) {
      walkers[walkers.length - 1].is_elite = true;
    } else {
       walkers[walkers.length - 1].is_elite = false;
    }
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
  var dist = [];    //used for novelty search
  for(var i = 0; i < config.population_size; i++){
    dist[i] = [];
  }
  for(var i = 0; i < config.population_size; i++){
    for(var j = i+1; j < config.population_size; j++){
      dist[i][j] = dist[j][i] = walker_distance(globals.walkers[i],globals.walkers[j]);
    }
  }
  for(var i = 0; i < config.population_size; i++){
    for(var j = 0; j < config.population_size; j++){
      if(i == j) continue;
    }
  }
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
  var elite_walkers = [];   //all the walkers of the previous round
  for(var i = 0; i < config.population_size; i++){
    if(dom_num[i] == 0) dom_queue.push(i);
    layer_num[i] = 0;
  }
  while(1){
    var walker_head = dom_queue.shift();
    if(typeof walker_head == 'undefined' || layer_num[walker_head] > processed_layer){
      //now begins the insertion of the last layer into the genome
      if(typeof walker_head == 'undefined') break;
      tmp_walkers.sort(function(a,b) {
        return Math.random()-0.5;
      });
      while(elite_walkers.length < config.elite_clones && tmp_walkers.length) elite_walkers.push(tmp_walkers.pop());
      tmp_walkers = [];
      processed_layer++;
      if(config.elite_clones == elite_walkers.length) break;
    }
    tmp_walkers.push(globals.walkers[walker_head]);
    while(dom_map[walker_head].length > 0){
      var j = dom_map[walker_head].pop();
      dom_num[j]--;
      layer_num[j] = Math.max(layer_num[j], layer_num[walker_head] + 1);
      if(dom_num[j] == 0) dom_queue.push(j);
    }
  }
  for(var k = 0; k < config.elite_clones; k++){
    genomes.push(elite_walkers[k].genome);
  }
  for(var k = config.elite_clones; k < config.population_size; k++) {
    var a = Math.floor(Math.random() * config.elite_clones);
    var b = Math.floor(Math.random() * config.elite_clones);
    genomes.push(copulate(elite_walkers[a],elite_walkers[b]));
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

walker_distance = function (a,b){
  // console.log(a.name + " - "+b.name);
  var i = 0, j = 0;
  var sum = 0 , num = 0;
  for(var k = config.walker_health; k >= 0; k -= config.snap_shot_time){
    while(i != a.behavior.length && a.behavior[i].health >= k) i++;
    i--;
    while(j != b.behavior.length && b.behavior[j].health >= k) j++;
    j--;
    var ang_a = a.behavior[i].angles;
    if(i != a.behavior.length - 1){
      for(var p = 0; p < ang_a.length; p++){
        ang_a[p] = ang_a[p] * (k - a.behavior[i+1].health) / (a.behavior[i].health - a.behavior[i+1].health) + a.behavior[i+1].angles[p] * (a.behavior[i].health - k) / (a.behavior[i].health - a.behavior[i+1].health);
      }
    }
    var ang_b = b.behavior[j].angles; 
    if(j != b.behavior.length - 1){
      for(var p = 0; p < ang_b.length; p++){
        ang_b[p] = ang_b[p] * (k - b.behavior[j+1].health) / (b.behavior[j].health - b.behavior[j+1].health) + b.behavior[j+1].angles[p] * (b.behavior[j].health - k) / (b.behavior[j].health - b.behavior[j+1].health);
      }
    }
    for(var p = 0; p < ang_a.length; p++){
      sum += Math.abs(ang_a[p]-ang_b[p]);
    }
    num++;
  }
  if(num == 0) return 0;
  return sum / num;
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