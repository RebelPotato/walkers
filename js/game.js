/*
TODO:
  more criteria 
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
  mutation_amount: 0.5,
  walker_health: 3000,
  check_health: true,
  elite_clones: 2,
  max_floor_tiles: 50,
  round_length: 50000,
  min_body_delta: 1.4,
  min_leg_delta: 0.4,
  instadeath_delta: 0.4,
  lazer_set: true,
  lazer_speed: 0.00025,
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

createNewGenerationGenomes = function() {//add NSGA-II
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
  var parents = null;
  // clones
  for(var k = 0; k < config.elite_clones; k++) {
    genomes.push(globals.walkers[k].genome);
  }
  for(var k = config.elite_clones; k < config.population_size; k++) {
    if(parents = pickParents()) {
      genomes.push(copulate(globals.walkers[parents[0]], globals.walkers[parents[1]]));
    }
  }
//  genomes = mutateClones(genomes);
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
    // if(Math.random() < 0.5) {
    if(Math.random() < walker_1.score / (walker_1.score + walker_2.score)) {      //temporary hack for no good choosing
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