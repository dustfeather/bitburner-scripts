/** @param {NS} ns */
export async function ChangeLogs(ns, num = 4.7) {
  ns.disableLog(`disableLog`);
  ns.disableLog(`sleep`);
  const logs = {
    4.7: [`go/4.7.js`,
      `- "enums.order" was reversed, so that "rotateVs" goes from Illuminati to Netburners`,
      `- Implimented a check to ensure the "OptionsFile" will be updated to default values if using an pre 4.6 version`,
      `- Cheat moves are now prefered less for a given history rank`,
      `- Modulized large portions of the script`,
      `- Starting the script without any arguments, won't cause it to change options in the "OptionsFile" now`,
      `- Fixed bug making the rank and vsNum of cheat moves be too high`,
      `- Consolidated a number of variables into objects for easier parameter passing`,
      `- The end-of-game pruning code now will run if you have a really high "wCounter" even if you haven't won on a new board`,
      `- "onStartup.deleteOldBoards" now prunes boardHistory on startup, instead of just ensuring it'll happen after the first game`,
      `- "Options" get updated from the "OptionsFile" each turn rather then at each games start`,
      `- Continued work on "SummonCheatMode"`,
      `- Fixed a bug that stopped "rotateVs" from working if the pruning code was ran that game`,
      `- Fixed a bug where "play2moves" cheats thats 2nd node ended in 0 wouldn't get saved properly`,
      `- "look4Better" now delays the eariler activating pruning code`,
    ]
  };
  let First = true;
  for (const version of Object.keys(logs).sort((a, b) => { return a - b; })) {
    if (version <= num) {
      if (First) { First = false; } else { ns.print("---------------------------------------------------"); }
      for (const log of logs[version]) { ns.print(log); }
      await ns.sleep(5000 * logs[version].length);
    }
  }
}

/** @param {NS} ns */
export async function main(ns, go = ns.go) {

  ns.disableLog('sleep');
  ns.disableLog('run');
  ns.clearLog();
  ns.tail();

  const colours = { yellow: "\u001b[33m", green: "\u001b[32m", red: "\u001b[31m" };

  const OptionsFile = new FileHandler(ns, "go/options.txt");
  let Options = {
    monkeySee: false,         // Enables manual control
    playForever: true,        // Starts new games automatically instead of asking
    autoCheatSucMin: 0.8,     // Minimum success chance to allow auto to cheat. nb: 0.8 = 80%
    finalRepairMod: 1.25,     // Modifies autoCheatSucMin when end-of-game repairing. nb: (0.8*) 1.25 -> 100%
    look4Better: false,       // In auto: changes move priority to [Netural, Positive, Negative]
    //                           In manual: prevents monkeyDo from automatically being turned on
    rotateVs: true,           // Goes through supported opponents while playForever is enabled
    preferedBoardSize: 5,     // If set to 5, 7, 9, or 13: attempts to use that size board for new boards
    debuging: false,          // Enables a bunch of debuggers
    onStartup: {              // Options that can only be manually changed while script is inactive
      allowCheats: false,       // Enables use of go/cheat.js
      summonCheatMode: 0,       // 0: Runs the cheat script only when we attempt a cheat
      //                           1: Runs the cheat script at the start of each game, then only when needed
      //                           2: Starts a cheat script on script start, then leaves it running
      deleteOldBoards: false,   // Enables the pruning code early, changes to false after loading
      wCounter: 0,                     // A counter to enable the pruning code, gets reset to 0 when it does
      usingGVM: true,           // Enables use of analyze.getValidMoves(). If disabled, 
      //                           requires editing of script to reduce RAM
      "?": false,               // Enables fighting "????????????"
    }
  }
  // Attempt to load Options from OptionsFile
  try {
    Options = OptionsFile.read();
    if (!Options.onStartup || Options.onStartup.summonCheatMode == undefined) { throw Error; }
    if (ns.args[0] !== undefined) {
      if (ns.args[0] == true) { Options.monkeySee = true; }
      else { Options.monkeySee = false; }   // Disable manual control
      if (ns.args[1] == false) { Options.playForever = false; }
      else { Options.playForever = true; }  // Set to Start new games automatically
      if (ns.args[2] == true) { Options.look4Better = true; }
      else { Options.look4Better = false; } // Set to just play what we know if able
      OptionsFile.write(Options);
    }
  } catch { OptionsFile.write(Options); }
  if (Options.debuging) { debugger; }
  const boardHistoryFile = new FileHandler(ns, "go/boardHistory.txt");
  try { boardHistoryFile.read() } catch { ns.print(`${colours.yellow}No Info detected!`); boardHistoryFile.write({}); }
  const boardHistory = boardHistoryFile.read();
  const enums = {
    name2Num: {
      "No AI": 0, "Netburners": 1, "Slum Snakes": 2, "The Black Hand": 3,
      "Tetrads": 4, "Daedalus": 5, "Illuminati": 6, "????????????": 7
    },
    num2Name: {
      0: "No AI", 1: "Netburners", 2: "Slum Snakes", 3: "The Black Hand",
      4: "Tetrads", 5: "Daedalus", 6: "Illuminati", 7: "????????????"
    },
    order: ["????????????", "Illuminati", "Daedalus", "Tetrads",
      "The Black Hand", "Slum Snakes", "Netburners", "No AI"],
  };
  const scriptInfo = {
    Init: true,
    UsingGVM: Options.onStartup.usingGVM,
    AllowCheats: Options.onStartup.allowCheats,
    Qenabled: Options.onStartup["?"],
    SummonCheatMode: Options.onStartup.summonCheatMode,
    WCounter: Options.onStartup.wCounter,
    MotherPort: ns.pid,
    PermaChildPort: 0,
    GetPruneCompareNumber(Options, gameInfo) { if (Options.look4Better && gameInfo.monkeyDoEnforced) { return 1000; } return 10; }
  };

  let vs = go.getOpponent()
  let playAgain = false;

  if (Options.onStartup.deleteOldBoards) {
    await pruneBoardHistory(ns, boardHistory, Options, colours);
    Options.onStartup.deleteOldBoards = false;
    OptionsFile.write(Options);
  }
  if (enums.order.includes(vs)) { while (enums.order[0] !== vs) { enums.order.push(enums.order.shift()); } }
  if (scriptInfo.SummonCheatMode == 2) { scriptInfo.PermaChildPort = await summonCheats(ns, scriptInfo, colours); }

  do {
    if (Options.debuging) { debugger; }
    await startNewBoard(ns, vs, playAgain, enums, scriptInfo, Options, OptionsFile);

    scriptInfo.Init = false;
    vs = go.getOpponent();

    const gameInfo = {
      newMsgGiven: false,
      vs: vs,
      vsNum: -1,
      lastCheatChance: 1,
      gameHasUnseenBoard: false,
      moveResult: { type: "invalid", x: -1, y: -1 },
      monkeyDoEnforced: false,
      weWon: false,
      movesMade: [{
        boardName: '', moveMade: '', cheatInfo: {
          what: "ActionNameShort", sucChance: 0.00, node: "[x,y,w,z] (nb: stored as short)", success: false
        }
      }],
      async resetTurnValidGameInfo() { this.resetMoveResult(); await this.resetNewMsgGiven(); },
      resetMoveResult() { this.moveResult = { type: "invalid", x: -1, y: -1 }; },
      async resetNewMsgGiven() {
        this.newMsgGiven = false;
        this.vsNum = await setVsNum(ns, enums, this.newMsgGiven, this.vs, colours);
      }
    };
    gameInfo.movesMade.pop();

    //  async function playTurn()
    do {
      await gameInfo.resetTurnValidGameInfo();

      Options = OptionsFile.read();
      Options.onStartup.wCounter = scriptInfo.WCounter;
      OptionsFile.write(Options);

      const turnInfo = {
        boardName: '',
        testBoard: [''],
        unseenBoard: false,
        ourNode: 0,
        foeNode: 0,
        moveEntries: [['', { r: 0, v: 0 }]],
        monkey: {
          See: Options.monkeySee,
          Do: !Options.look4Better,
          Lie: false,
          Memory: { moveName: "", r: 0, v: 0 }
        },
        cheatRepeat: { "t": [""], "d": [""], "f": [""], "2": [""] }
      };

      if (gameInfo.monkeyDoEnforced) { Options.look4Better = false; turnInfo.monkey.Do = true; }
      turnInfo.testBoard = go.getBoardState();
      turnInfo.boardName = boardNameTranslate(turnInfo.testBoard);
      turnInfo.testBoard = buildTestBoard(turnInfo.testBoard);
      turnInfo.cheatRepeat = { t: [], d: [], f: [], "2": [] };
      turnInfo.moveEntries = buildMoveEntries(ns, boardHistory, turnInfo, gameInfo, scriptInfo, Options)
      turnInfo.ourNode = turnInfo.moveEntries.shift(); turnInfo.foeNode = turnInfo.moveEntries.shift();

      if (Options.debuging) { debugger; }

      // Set turnInfo.unseenBoard *AND* if (set to true) {do what's in the following block}
      if (turnInfo.unseenBoard = checkIfNewBoard(boardHistory, turnInfo.boardName)) {
        if (!gameInfo.newMsgGiven) { ns.print(`${colours.yellow}New BoardState detected!`);[gameInfo.newMsgGiven, gameInfo.gameHasUnseenBoard] = [true, true]; }
        boardHistory[turnInfo.boardName] = {};
        if (turnInfo.ourNode >= turnInfo.testBoard.length - 2 && turnInfo.foeNode <= 0) { boardHistory[turnInfo.boardName].p = { r: 1, v: 0 }; }
      }

      //  turnInfo.moveEntries = [['',{}]] where:
      //  [0] = "[x,y]" || "pass" || "cheat"; 
      //  [1] = { r(ratio): number, v(vNum): number, score: number };

      updateMonkeyDoAndMemory(ns, turnInfo, gameInfo);

      // Don't sort *IF* we haven't seen this board, manual is allowed AND we're currently not on auto
      if (!turnInfo.unseenBoard || (!turnInfo.monkey.See || turnInfo.monkey.Do)) {
        turnInfo.moveEntries.sort((a, b) => sortArray(a, b, gameInfo.vsNum, Options.look4Better));
      }

      //  async function attemptMove() { }
      {
        let loopProtected = false;
        let cheatInfo =
          { what: "ActionNameShort", sucChance: 0.00, node: "[x,y,w,z] (nb: stored as short)", success: false }
        const movesRecordedAtStart = gameInfo.movesMade.length;
        do {
          if (Options.debuging) { debugger; }
          gameInfo.resetMoveResult();
          cheatInfo = { what: "stop cheating", sucChance: 0, node: "", success: false }
          const center = moveNameTranslate(
            `[${Math.trunc(go.getBoardState().length / 2)},${Math.trunc(go.getBoardState().length / 2)}]`);
          if ((!gameInfo.newMsgGiven || turnInfo.monkey.Lie) && Options.look4Better && turnInfo.monkey.See && !turnInfo.monkey.Do) {
            if (turnInfo.monkey.Memory.moveName !== "cheat") {
              ns.print(`${turnInfo.monkey.Memory.moveName}: { r: ${turnInfo.monkey.Memory.r}, v: ${turnInfo.monkey.Memory.v} }`);
            }
            else {
              let bestCheat = { type: null, name: null, r: 0, v: 0 };
              for (const cheatMoveType of Object.entries(boardHistory[turnInfo.boardName].c)) {
                for (const cheatMove of Object.entries(cheatMoveType[1])) {
                  if (cheatMove[1].v >= bestCheat.v && cheatMove[1].r > bestCheat.v) {
                    bestCheat = { type: cheatMoveType[0], name: cheatMove[0], r: cheatMove[1].r, v: cheatMove[1].v };
                  }
                }
              }
              ns.print(`cheat, ${moveNameTranslate(bestCheat.type, false)
                }, ${moveNameTranslate(bestCheat.name, false)}: { r: ${bestCheat.r}, v: ${bestCheat.v} }`);
            }
          }
          if (turnInfo.ourNode <= 0 && turnInfo.foeNode <= 0 && (
            !boardHistory[turnInfo.boardName][center] || boardHistory[turnInfo.boardName][center].r >= 0
          )) {
            if (turnInfo.monkey.Lie) {
              const logs = ns.getScriptLogs();
              logs.pop(); ns.clearLog();
              for (const log of logs) { ns.print(log); }
            }
            let [x, y] = JSON.parse(moveNameTranslate(center, false));
            try {
              gameInfo.moveResult = await go.makeMove(x, y);
              gameInfo.movesMade.push({ "boardName": turnInfo.boardName, moveMade: center });
            } catch { gameInfo.moveResult.type = "invalid"; }
          }
          else if (turnInfo.ourNode >= turnInfo.testBoard.length - 2 && turnInfo.foeNode <= 0) {
            const repairCheatMin = Math.max(Math.min(Options.autoCheatSucMin * Options.finalRepairMod, 1), 0);
            if (scriptInfo.AllowCheats && gameInfo.lastCheatChance >= repairCheatMin) {
              if (Options.debuging) { debugger; }
              const deadNodes = [];
              let x, y; x = -1;
              for (const coloumString of turnInfo.testBoard) {
                y = -1;
                for (const node of coloumString) {
                  if (node === "#") {
                    deadNodes.push({
                      node: `[${x},${y}]`,
                      r: 0, v: 0,
                      score: moveScore(`[${x},${y}]`, turnInfo.testBoard)
                    });
                  }
                  y++;
                }
                x++;
              }
              if (deadNodes.length > 0) {
                if (deadNodes.length > 1) {
                  deadNodes.sort((a, b) => sortArray([, a], [, b], gameInfo.vsNum, Options.look4Better)); deadNodes.reverse();
                }
                let request = { what: "success", xy: [-1, -1] };
                ns.clearPort(scriptInfo.MotherPort);
                ns.writePort(scriptInfo.MotherPort, request);
                let childPort = 0;
                if (scriptInfo.PermaChildPort) { childPort = scriptInfo.PermaChildPort; }
                else {
                  childPort = await summonCheats(ns, scriptInfo, colours, `Repair Cheat initalizing`);
                }
                if (ns.peek(childPort) === "NULL PORT DATA") { await ns.nextPortWrite(childPort); }
                const sucChance = ns.readPort(childPort);
                cheatInfo.sucChance = sucChance;
                gameInfo.lastCheatChance = sucChance;
                if (sucChance >= repairCheatMin) {
                  if (sucChance < 1) { ns.print(`Success chance of repair: ${ns.formatPercent(sucChance)}`); }
                  request = { what: "repair", xy: JSON.parse(deadNodes[0].node) }
                  cheatInfo.what = moveNameTranslate(request.what);
                  cheatInfo.node = moveNameTranslate(JSON.stringify(request.xy));
                  ns.writePort(scriptInfo.MotherPort, request);
                  await ns.nextPortWrite(childPort);
                  gameInfo.moveResult = ns.readPort(childPort);
                  cheatInfo.success = gameInfo.moveResult.success;
                  if (gameInfo.moveResult.logs) { for (const log of gameInfo.moveResult.logs) { ns.print(log); } }
                  request = { what: "success", xy: [-1, -1] };
                  ns.writePort(scriptInfo.MotherPort, request);
                  await ns.nextPortWrite(childPort);
                  gameInfo.lastCheatChance = ns.readPort(childPort);
                  if (gameInfo.moveResult.type === "invalid" || gameInfo.moveResult.type === "crash") { loopProtected = true; }
                }
                else {
                  gameInfo.moveResult.type = "invalid";
                  ns.print(`${colours.yellow
                    }Repair deactivated: Success chance below minimums (${ns.formatPercent(sucChance)
                    }/${ns.formatPercent(repairCheatMin)})`);
                }
              }
              if (scriptInfo.SummonCheatMode != 2) { ns.writePort(scriptInfo.MotherPort, { what: "stop cheating" }); }
            }
            if (turnInfo.boardName === boardNameTranslate(go.getBoardState())) {
              try {
                gameInfo.moveResult = await go.passTurn();
                gameInfo.movesMade.push({ "boardName": turnInfo.boardName, moveMade: "p" });
              } catch { gameInfo.moveResult.type = "invalid"; }
            }
          }
          else {
            const autoCheatSucMin = Math.max(Math.min(Options.autoCheatSucMin, 1), 0);
            if (!turnInfo.monkey.See || turnInfo.monkey.Do) {
              do {
                if (Options.debuging) { debugger; }
                if (!turnInfo.moveEntries[0] || (false && turnInfo.unseenBoard && gameInfo.movesMade.length > 10)) {
                  try {
                    turnInfo.moveEntries.unshift(["pass"]);
                    gameInfo.moveResult = await go.passTurn();
                  } catch { gameInfo.moveResult.type = "invalid"; }
                  if (gameInfo.movesMade.length > 0 && gameInfo.moveResult.type !== "gameOver"
                    && gameInfo.movesMade[gameInfo.movesMade.length - 1].moveMade === "p") {
                    if (boardHistory[turnInfo.boardName].p) {
                      boardHistory[turnInfo.boardName].p.r = -0.1;
                      if (boardHistory[turnInfo.boardName].p.v === 0) {
                        boardHistory[turnInfo.boardName].p.v = 0.1;
                      }
                    }
                    else { boardHistory[turnInfo.boardName].p = { r: -0.1, v: 0.1 }; }
                    while (gameInfo.movesMade.length > 0) { gameInfo.movesMade.pop(); }
                    gameInfo.moveResult = { type: "gameOver", x: null, y: null };
                  }
                }
                else if (turnInfo.moveEntries[0][0] === "pass") { await passTurn(go, gameInfo); }
                else if (turnInfo.moveEntries[0][0] === "cheat") {
                  if (gameInfo.lastCheatChance >= autoCheatSucMin) {
                    let request = { what: "success", xy: [-1, -1] };
                    ns.clearPort(scriptInfo.MotherPort);
                    ns.writePort(scriptInfo.MotherPort, request);
                    let childPort = 0;
                    if (scriptInfo.PermaChildPort) { childPort = scriptInfo.PermaChildPort; }
                    else {
                      childPort = await summonCheats(ns, scriptInfo, colours);
                    }
                    if (ns.peek(childPort) === "NULL PORT DATA") { await ns.nextPortWrite(childPort); }
                    const sucChance = ns.readPort(childPort);
                    cheatInfo.sucChance = sucChance;
                    gameInfo.lastCheatChance = sucChance;
                    if (gameInfo.lastCheatChance >= autoCheatSucMin) {
                      if (sucChance < 1) { ns.print(`Success chance of cheating: ${ns.formatPercent(sucChance)}`); }
                      const emptyNodes = [], deadNodes = [], occupiedNodes = [];
                      let x, y; x = -1;
                      for (const coloumString of turnInfo.testBoard) {
                        y = -1;
                        for (const node of coloumString) {
                          if (node !== "W") {
                            if (node === ".") { emptyNodes.push(`[${x},${y}]`); }
                            else if (node === "#") { deadNodes.push(`[${x},${y}]`); }
                            else { occupiedNodes.push(`[${x},${y}]`); }
                          }
                          y++;
                        }
                        x++;
                      }

                      const cheats = [];
                      const cheatChoices = [];
                      // Load in potential cheats
                      if (emptyNodes.length > 1) {
                        cheatChoices.push("play");
                        for (let i = 0; i < emptyNodes.length; ++i) {
                          for (let i2 = i + 1; i2 < emptyNodes.length; i2++) {
                            if (i2 <= i) { continue; }
                            const pieces = [...JSON.parse(emptyNodes[i]), ...JSON.parse(emptyNodes[i2])];
                            const node = `[${pieces[0]},${pieces[1]},${pieces[2]},${pieces[3]}]`;
                            let loopProtected = false;
                            for (const node1 of turnInfo.cheatRepeat["2"]) {
                              if (node1 == node) {
                                loopProtected = true; break;
                              }
                            }
                            if (!loopProtected) {
                              cheats.push(["play", {
                                node: node,
                                r: 0, v: 0,
                                score: moveScore({
                                  type: "play",
                                  node1: emptyNodes[i],
                                  node2: emptyNodes[i2]
                                }, turnInfo.testBoard)
                              }]);
                            }
                          }
                        }
                      }
                      if (deadNodes.length > 0) {
                        cheatChoices.push("repair");
                        for (const node of deadNodes) {
                          let loopProtected = false;
                          for (const node1 of turnInfo.cheatRepeat.f) {
                            if (node1 == node) { loopProtected = true; break; }
                          }
                          if (!loopProtected) {
                            cheats.push(["repair", {
                              node: node,
                              r: 0, v: 0,
                              score: moveScore({ type: "repair", node: node }, turnInfo.testBoard)
                            }]);
                          }
                        }
                      }
                      if (emptyNodes.length > 0) {
                        cheatChoices.push("destroy");
                        for (const node of emptyNodes) {
                          let loopProtected = false;
                          for (const node1 of turnInfo.cheatRepeat.d) {
                            if (node1 == node) { loopProtected = true; break; }
                          }
                          if (!loopProtected) {
                            cheats.push(["destroy", {
                              node: node,
                              r: 0, v: 0,
                              score: moveScore({ type: "destroy", node: node }, turnInfo.testBoard)
                            }]);
                          }
                        }
                      }
                      if (occupiedNodes.length > 0) {
                        cheatChoices.push("remove");
                        for (const node of occupiedNodes) {
                          let loopProtected = false;
                          for (const node1 of turnInfo.cheatRepeat.t) {
                            if (node1 == node) { loopProtected = true; break; }
                          }
                          if (!loopProtected) {
                            cheats.push(["remove", {
                              node: node,
                              r: 0, v: 0,
                              score: moveScore({ type: "remove", node: node }, turnInfo.testBoard)
                            }]);
                          }
                        }
                      }
                      // Load in history of past cheats
                      if (boardHistory[turnInfo.boardName].c) {
                        if (Options.debuging) { debugger; }
                        for (const cheat of cheats) {
                          let shortcut = boardHistory[turnInfo.boardName].c[moveNameTranslate(cheat[0])];
                          if (shortcut && shortcut[moveNameTranslate(cheat[1].node)]) {
                            shortcut = shortcut[moveNameTranslate(cheat[1].node)];
                            cheat[1].r = shortcut.r;
                            cheat[1].v = shortcut.v;
                          }
                        }
                      }

                      //  [0] = "play" || "repair" || "destory" || "remove"; 
                      //  [1] = { node: (`[x,y]` || `[x,y,w,z]`), r(ratio): number, v(vNum): number, score: 0 };

                      cheats.sort((a, b) => sortArray(a, b, gameInfo.vsNum, Options.look4Better));
                      while (cheats.length > 0 && !cheatChoices.includes(cheats[0][0])) { cheats.shift(); }

                      if (cheats.length > 0) {
                        request = { what: cheats[0][0], xy: JSON.parse(cheats[0][1].node) };
                        cheatInfo.what = moveNameTranslate(request.what);
                        cheatInfo.node = moveNameTranslate(cheats[0][1].node);
                        ns.writePort(scriptInfo.MotherPort, request);
                        await ns.nextPortWrite(childPort);
                        gameInfo.moveResult = ns.readPort(childPort);
                        cheatInfo.success = gameInfo.moveResult.success;
                        if (gameInfo.moveResult.logs) { for (const log of gameInfo.moveResult.logs) { ns.print(log); } }
                      }
                      else {
                        ns.print(`${colours.yellow}Cheats deactivated: Could not find valid cheat`);
                        gameInfo.moveResult.type = "invalid";
                      }
                    }
                    else { // if (gameInfo.lastCheatChance < autoCheatSucMin) {
                      ns.print(`${colours.yellow
                        }Cheats deactivated: Success chance below minimums (${ns.formatPercent(sucChance)
                        }/${ns.formatPercent(autoCheatSucMin)})`);
                      gameInfo.moveResult.type = "invalid";
                    }
                    if (scriptInfo.SummonCheatMode != 2) { ns.writePort(scriptInfo.MotherPort, { what: "stop cheating" }); }
                  }
                }
                else /*if a move*/ { await makeMove(go, turnInfo.moveEntries[0][0], gameInfo); }
                if (gameInfo.moveResult.type === "invalid" || gameInfo.moveResult.type === "crash") { turnInfo.moveEntries.shift(); }
              } while (gameInfo.moveResult.type === "invalid" || gameInfo.moveResult.type === "crash");
              gameInfo.movesMade.push({ "boardName": turnInfo.boardName, moveMade: moveNameTranslate(turnInfo.moveEntries[0][0]) });
            }
            else /* if (turnInfo.monkey.See && !turnInfo.monkey.Do) */ {
              let playerChoice;
              let choices = ["Please Wait", "5 sec Plz"];
              for (const move of turnInfo.moveEntries) { choices.push(move[0]); }
              if (Options.look4Better) { choices.push("monkeyDo"); }
              choices.push("restart");

              do {
                if (Options.debuging) { debugger; }
                playerChoice = null;
                gameInfo.moveResult.type = "invalid";

                while (!playerChoice) {
                  playerChoice = await ns.prompt("Pick a move", { type: "select", choices: choices });
                }

                if (playerChoice === "Please Wait") {
                  await ns.sleep(await ns.prompt("How long (in minutes)", { type: "text" }) * 60000);
                  gameInfo.moveResult.type = "invalid";
                }
                else if (playerChoice === "5 sec Plz") { await ns.sleep(5000); gameInfo.moveResult.type = "invalid"; }
                else if (playerChoice === "pass") { await passTurn(go, gameInfo); }
                else if (playerChoice === "cheat") {
                  let request = { what: "success", xy: [-1, -1] };
                  ns.clearPort(scriptInfo.MotherPort);
                  ns.writePort(scriptInfo.MotherPort, request);
                  let childPort = 0;
                  if (scriptInfo.PermaChildPort) { childPort = scriptInfo.PermaChildPort; }
                  else {
                    childPort = await summonCheats(ns, scriptInfo, colours);
                  }
                  if (Options.debuging) { debugger; }
                  if (ns.peek(childPort) === "NULL PORT DATA") { await ns.nextPortWrite(childPort); }
                  const sucChance = ns.readPort(childPort);
                  cheatInfo.sucChance = sucChance;
                  gameInfo.lastCheatChance = sucChance;
                  if (sucChance < autoCheatSucMin) {
                    ns.print(`${colours.red}Warning: ${colours.yellow
                      }Success chance below auto minimums (${colours.red}${ns.formatPercent(sucChance)
                      }${colours.yellow}/${ns.formatPercent(autoCheatSucMin)})`);
                  }
                  else { ns.print(`Success chance of cheating: ${ns.formatPercent(sucChance)}`); }
                  const emptyNodes = [], deadNodes = [], occupiedNodes = [];
                  let x, y; x = -1;
                  for (const coloumString of turnInfo.testBoard) {
                    y = -1;
                    for (const node of coloumString) {
                      if (node !== "W") {
                        if (node === ".") { emptyNodes.push(`[${x},${y}]`); }
                        else if (node === "#") { deadNodes.push(`[${x},${y}]`); }
                        else { occupiedNodes.push(`[${x},${y}]`); }
                      }
                      y++;
                    }
                    x++;
                  }
                  const cheatChoices = ["stop cheating"];
                  if (occupiedNodes.length > 0) { cheatChoices.unshift("remove"); }
                  if (emptyNodes.length > 0) { cheatChoices.unshift("destroy"); }
                  if (deadNodes.length > 0) { cheatChoices.unshift("repair"); }
                  if (emptyNodes.length > 1) { cheatChoices.unshift("play"); }
                  let selectedCheat =
                    await ns.prompt(`Success chance: ${ns.formatPercent(sucChance)}, what cheat?`,
                      { type: "select", choices: cheatChoices });
                  if (!selectedCheat) { selectedCheat = "stop cheating"; }
                  request.what = selectedCheat;
                  if (selectedCheat !== "stop cheating") {
                    if (Options.debuging) { debugger; }
                    cheatInfo.what = moveNameTranslate(selectedCheat);
                    ns.print(`${colours.yellow}Selecting cheat target(s)`);
                    if (selectedCheat === "play") {
                      let node1, node2;
                      do {
                        node1 =
                          await ns.prompt("First node to place?", { type: "select", choices: emptyNodes });
                        node2 =
                          await ns.prompt(`First node: ${node1}, 2nd?`, { type: "select", choices: emptyNodes });
                      } while (node1 === "play" || node2 === "play" || node1 === node2)
                      node1 = JSON.parse(node1); node2 = JSON.parse(node2);
                      if (node1[0] < node2[0] || (node1[0] == node2[0] && node1[1] < node2[1])) {
                        request.xy = [...node1, ...node2];
                      }
                      else { request.xy = [...node2, ...node1]; }
                      cheatInfo.node = moveNameTranslate(JSON.stringify(request.xy));
                    }
                    else if (selectedCheat === "repair") {
                      let node =
                        await ns.prompt("Repair what node?", { type: "select", choices: deadNodes });
                      do {
                        node = await ns.prompt("Repair what node?", { type: "select", choices: deadNodes });
                      } while (node === "repair")
                      request.xy = JSON.parse(node);
                      cheatInfo.node = moveNameTranslate(node);
                    }
                    else if (selectedCheat === "remove") {
                      let node =
                        await ns.prompt("Remove what node?", { type: "select", choices: occupiedNodes });
                      do {
                        node = await ns.prompt("Remove what node?", { type: "select", choices: occupiedNodes });
                      } while (node === "remove")
                      request.xy = JSON.parse(node);
                      cheatInfo.node = moveNameTranslate(node);
                    }
                    else if (selectedCheat === "destroy") {
                      let node =
                        await ns.prompt("Destroy what node?", { type: "select", choices: emptyNodes });
                      do {
                        node = await ns.prompt("Destroy what node?", { type: "select", choices: emptyNodes });
                      } while (node === "destroy")
                      request.xy = JSON.parse(node);
                      cheatInfo.node = moveNameTranslate(node);
                    }
                    ns.writePort(scriptInfo.MotherPort, request);
                    await ns.nextPortWrite(childPort);
                    gameInfo.moveResult = ns.readPort(childPort);
                    cheatInfo.success = gameInfo.moveResult.success;
                    if (gameInfo.moveResult.logs) { for (const log of gameInfo.moveResult.logs) { ns.print(log); } }
                  }
                  if (selectedCheat === "stop cheating") {
                    ns.print(`${colours.yellow}Cheats deactivated`);
                    gameInfo.moveResult.type = "invalid";
                  }
                  if (scriptInfo.SummonCheatMode != 2) { ns.writePort(scriptInfo.MotherPort, { what: "stop cheating" }); }
                }
                else if (playerChoice === "restart") {
                  let penalty;
                  while (!isFinite(penalty) || penalty < 0) {
                    penalty = await ns.prompt(
                      `What penalty (if any) should be given? (suggested ${(turnInfo.testBoard.length - 2) / 10})`,
                      { type: "text" });
                  }
                  if (!isFinite(penalty) || penalty < 0) { penalty = 1000; }
                  ns.print(`Restart requested... ${gameInfo.vs}: ${penalty},  Player: 0`);
                  gameInfo.moveResult = { type: "gameOver", x: null, y: null };
                }
                else if (playerChoice === "monkeyDo") {
                  [Options.look4Better, turnInfo.monkey.Do] = [false, true];
                  gameInfo.monkeyDoEnforced = true;
                  turnInfo.moveEntries.sort((a, b) => sortArray(a, b, gameInfo.vsNum, false));
                  gameInfo.moveResult.type = "retry";
                }
                else if (playerChoice) { await makeMove(go, playerChoice, gameInfo); }
                if (gameInfo.moveResult.type === "crash" || (playerChoice && gameInfo.moveResult.type === "invalid" && (
                  playerChoice !== "Please Wait" && playerChoice !== "5 sec Plz" &&
                  playerChoice !== "cheat" && playerChoice !== "monkeyDo"))) {
                  choices.splice(choices.findIndex(x => x === playerChoice), 1);
                }
              } while (gameInfo.moveResult.type === "invalid" || gameInfo.moveResult.type === "crash");
              if (gameInfo.moveResult.type !== "retry") {
                gameInfo.movesMade.push({ "boardName": turnInfo.boardName, "moveMade": moveNameTranslate(playerChoice) });
              }
            }
          }
          if (gameInfo.moveResult.type === "invalid" && loopProtected) {
            ns.closeTail(); ns.tail(); await ns.sleep(); debugger;
          }
        } while (gameInfo.moveResult.type === "invalid" || gameInfo.moveResult.type === "retry");
        if (cheatInfo.what !== "stop cheating" && movesRecordedAtStart < gameInfo.movesMade.length) {
          gameInfo.movesMade[gameInfo.movesMade.length - 1].cheatInfo = cheatInfo;
        }
      }

      await removePassingSuggestion(ns, gameInfo.vs);

      if (gameInfo.moveResult.type !== "gameOver" && turnInfo.boardName === boardNameTranslate(go.getBoardState())) {
        await ns.sleep();
        if (Options.debuging) { debugger; }
      }
    } while (gameInfo.moveResult.type !== "gameOver");

    playAgain = await recordScoreAndReturnPlayAgain(ns, boardHistory, boardHistoryFile, playAgain, gameInfo, Options, colours);

    if (gameInfo.weWon && ++scriptInfo.WCounter >= scriptInfo.GetPruneCompareNumber(Options, gameInfo) && (gameInfo.gameHasUnseenBoard || scriptInfo.WCounter >= 1e7)) {
      scriptInfo.WCounter = 0;
      await pruneBoardHistory(ns, boardHistory, Options, colours);
    }

  } while (Options.playForever || playAgain);
}

/** @param {NS} ns */
export class FileHandler {
  #file;
  #ns;

  constructor(ns, file) {
    this.#ns = ns;
    this.#file = file;
  }

  newFile(type = "blank") {
    if (type == "object") { this.#ns.write(this.#file, "{}", "w"); }
    else if (type == "array") { this.#ns.write(this.#file, "[]", "w"); }
    else { this.#ns.write(this.#file, "", "w"); }
  }

  write(data, mode = "w") {
    this.#ns.write(this.#file, JSON.stringify(data), mode);
  }

  read() {
    return JSON.parse(this.#ns.read(this.#file));
  }

  append(data, mode = "a") {
    this.#ns.write(this.#file, JSON.stringify(data), mode);
  }
}

/** @param {NS} ns */
async function startNewBoard(
  ns,
  vs = '',
  playAgain = false,
  enums,
  scriptInfo,
  Options,
  OptionsFile
) {
  const [go, Init, Qenabled] = [ns.go, scriptInfo.Init, scriptInfo.Qenabled];
  if (Init) { return go.resetBoardState(vs, go.getBoardState().length); }
  if (Options.debuging) { debugger; }
  let newLength = Options.preferedBoardSize;
  if (Options.playForever && playAgain) {
    playAgain = false;
    let newVS;
    if (await ns.prompt("Same same?")) {
      if (![5, 7, 9, 13].includes(newLength)) { newLength = go.getBoardState().length; }
      newVS = vs;
    }
    while (!newVS) {
      const choices = Object.keys(enums.name2Num);
      if (!Qenabled) { choices.slice(choices.findIndex("????????????"), 1); }
      newVS = await ns.prompt("Who we fighting?", { type: "select", choices: choices });
    }
    if (newVS === "????????????") { newLength = 19; }
    while (![5, 7, 9, 13, 19].includes(newLength)) {
      newLength = await ns.prompt("How big?", { type: "select", choices: [5, 7, 9, 13] });
    }
    return go.resetBoardState(newVS, newLength);
  }
  let log = ns.getScriptLogs(); log.pop(); log.pop();
  const earlierLog = log.pop(); log.pop(); log.pop(); log = log.pop();
  if (earlierLog && earlierLog.includes(`${vs}: `)) { log = earlierLog; }
  if (log && log.includes(`${vs}: `)) {
    const foeScore =
      eval(log.slice(log.lastIndexOf(`${vs}: `) + `${vs}: `.length, log.lastIndexOf(`,  Player: `)));
    const ourScore =
      eval(log.slice(log.lastIndexOf(`,  Player: `) + `,  Player: `.length));
    if (OptionsFile.read().rotateVs && ourScore > foeScore) {
      enums.order.push(enums.order.shift());
      while (["No AI", "????????????"].includes(enums.order[0])) {
        if (Qenabled && enums.order[0] === "????????????") { break; }
        enums.order.push(enums.order.shift());
      }
    }
  }
  if (enums.order[0] === "????????????") { newLength = 19; }
  if (!newLength) { newLength = go.getBoardState().length; }
  else {
    if (![5, 7, 9, 13, 19].includes(newLength)) { newLength = 5; }
    return go.resetBoardState(enums.order[0], newLength);
  }
}

/** @param {NS} ns */
async function setVsNum(ns, enums, newMsgGiven = false, vs = '', colours) {
  if (enums.name2Num[vs] !== undefined) { return enums.name2Num[vs]; }

  ns.tail();
  if (!newMsgGiven) { ns.print(`${colours.yellow}New Opponent detected!`); }
  for (const opponent of Object.entries(enums.name2Num)) {
    ns.print(opponent);
  }
  let newVSNumber = 0;
  newVSNumber = await ns.prompt(
    `Please look at log and select an appropriate difficulty level to assign to ${vs}`, { type: "text" });
  while (!(isFinite(newVSNumber) && !enums.num2Name[newVSNumber])) {
    for (const opponent of Object.entries(enums.name2Num)) {
      ns.print(opponent);
    }
    ns.print(`${newVSNumber} is not a valid number!`);
    ns.tail();
    newVSNumber = await ns.prompt(
      `Please look at log and select an appropriate difficulty level to assign to ${vs}`, { type: "text" });
  }

  ns.print(`The variable named "enums" within this script will require editing for ${vs
    } to be included within auto-farm`);
  enums.name2Num[vs] = newVSNumber;
  enums.num2Name[newVSNumber] = vs;
  return newVSNumber;
}

/** @param {NS} ns */
function boardNameTranslate(name2Translate = '' || [''], array2String = true) {
  if (name2Translate == '') { throw Error; }
  const result = [];
  if (!array2String) {
    const nameAsArray = JSON.parse(name2Translate);
    for (const coloumString of nameAsArray) {
      const newStringPieces = []
      const pieces = coloumString.split("");
      while (pieces.length > 0) {
        const nodeType = pieces.shift();
        if (!isFinite(pieces[0])) { newStringPieces.push(nodeType); }
        else {
          let i = pieces.shift();
          while (i > 0) { newStringPieces.push(nodeType); --i; }
        }
      }
      result.push("".concat(...newStringPieces));
    }
    return result;
  }
  for (const coloumString of name2Translate) {
    const newStringPieces = []
    const pieces = coloumString.split("");
    while (pieces.length > 0) {
      const nodeType = pieces.shift();
      let consecutive = 1;
      while (nodeType === pieces[0]) {
        consecutive++;
        pieces.shift();
      }
      if (consecutive === 1) { newStringPieces.push(nodeType); }
      else { newStringPieces.push(`${nodeType}${consecutive}`); }
    }
    result.push("".concat(...newStringPieces));
  }
  return JSON.stringify(result);
}

/** @param {NS} nsOrTestBoard */
function buildTestBoard(nsOrTestBoard = ns || ['']) {
  let testBoard;
  if (nsOrTestBoard.pid) { testBoard = nsOrTestBoard.go.getBoardState(); }
  else { testBoard = nsOrTestBoard; }
  const diamiter = testBoard.length;
  const result = [``.padEnd(diamiter + 2, "W")];
  for (let coloum of testBoard) {
    const pieces = coloum.split("");
    pieces.push("W"); pieces.unshift("W");
    result.push(pieces.join(""));
  }
  result.push(``.padEnd(diamiter + 2, "W"));
  return result;
}

/** @param {NS} ns */
function buildMoveEntries(
  ns,
  boardHistory,
  turnInfo = { boardName: '', testBoard: [''], cheatRepeat: {} },
  gameInfo = { vsNum: -1, movesMade: [{ boardName: '', moveMade: '', cheatInfo: {} }] },
  scriptInfo = { UsingGVM: true, AllowCheats: false },
  Options
) {
  if (turnInfo.boardName === '' || gameInfo.vsNum < 0 || !Options) { throw Error; }

  const go = ns.go;
  const [boardName, testBoard, cheatRepeat] = [turnInfo.boardName, turnInfo.testBoard, turnInfo.cheatRepeat];
  const [vsNum, movesMade] = [gameInfo.vsNum, gameInfo.movesMade];
  const [UsingGVM, AllowCheats] = [scriptInfo.UsingGVM, scriptInfo.AllowCheats];

  const moveEntries = [['', { r: 0, v: 0 }]]; moveEntries.pop();
  let ourNode = 0, foeNode = 0, xActual = -2, yActual = -2;
  for (const coloumString of testBoard) {
    xActual++;
    yActual = -2;
    for (const node of coloumString) {
      yActual++;
      if (node === "W" || node === "#") { continue; }
      if (node === "X") { ourNode++; continue; }
      if (node === "O") { foeNode++; continue; }
      //  if (node === ".") 
      let loopProtected = false;
      if (Options.debuging) { debugger; }
      for (const move of movesMade) {
        if (JSON.stringify({ boardName: boardName, moveMade: moveNameTranslate(`[${xActual},${yActual}]`) }) ==
          JSON.stringify(move)) { loopProtected = true; break; }
      }
      if (loopProtected) { continue; }
      const moveEntry = [`[${xActual},${yActual}]`, getMoveHistory(`[${xActual},${yActual}]`, boardHistory, turnInfo, vsNum)]
      if (!UsingGVM || go.analysis.getValidMoves()[xActual][yActual]) { moveEntries.push(moveEntry); }
    }
  }
  if (AllowCheats) { moveEntries.push(["cheat", getMoveHistory("cheat", boardHistory, turnInfo, vsNum)]); }
  moveEntries.push(["pass", getMoveHistory("pass", boardHistory, turnInfo, vsNum)]);

  // Loop protection for cheats
  for (const move of movesMade) {
    if (move.moveMade === "c" && move.cheatInfo.success &&
      JSON.stringify(move.boardName) === JSON.stringify(boardName)) {
      cheatRepeat[move.cheatInfo.what].push(moveNameTranslate(move.cheatInfo.node, false));
    }
  }
  return [ourNode, foeNode, ...moveEntries];
}

/** @param {NS} ns */
function getMoveHistory(
  moveName = '',
  boardHistory,
  turnInfo = { boardName: '', testBoard: [''] },
  vsNum
) {
  if (moveName == '' || turnInfo.boardName == '' || !vsNum) { throw Error; }

  const [boardName, testBoard] = [turnInfo.boardName, turnInfo.testBoard];

  if (checkIfNewBoard(boardHistory, boardName) ||
    !boardHistory[boardName][moveNameTranslate(moveName)]
  ) { return { r: 0, v: 0, score: moveScore(moveName, testBoard) }; }
  const info = boardHistory[boardName][moveNameTranslate(moveName)];
  if (moveName !== "cheat") { return { r: info.r, v: info.v, score: moveScore(moveName, testBoard) }; }
  let avgR = 0, avgV = 0, i = 0;
  for (const cheatMoveType of Object.values(info)) {
    for (const cheatMove of Object.values(cheatMoveType)) { avgR += cheatMove.r; avgV += cheatMove.v; i++; }
  }
  return { r: avgR / i, v: avgV / i, score: moveScore(moveName, testBoard) }
}

/** @param {NS} ns */
function moveNameTranslate(nameString2Translate = '', long2Short = true) {
  if (nameString2Translate == null || nameString2Translate == '') { return null; }
  if (!long2Short) {
    if (["c", "cheat"].includes(nameString2Translate)) { return "cheat"; }
    if (["p", "pass"].includes(nameString2Translate)) { return "pass"; }
    //  if (["r", "restart"].includes(nameString2Translate)) { return "restart"; }
    if (["t", "remove"].includes(nameString2Translate)) { return "remove"; }
    if (["d", "destroy"].includes(nameString2Translate)) { return "destroy"; }
    if (["f", "repair"].includes(nameString2Translate)) { return "repair"; }
    if (["2", "play"].includes(nameString2Translate)) { return "play"; }
    if (nameString2Translate.length === 2) {
      const pieces = nameString2Translate.split("");
      return `[${pieces[0]},${pieces[1]}]`;
    }
    const pieces = nameString2Translate.split(",");
    if (pieces.length === 2) { return `[${pieces[0]},${pieces[1]}]`; }
    return `[${pieces[0]},${pieces[1]},${pieces[2]},${pieces[3]}]`;
  }
  if (["cheat", "c"].includes(nameString2Translate)) { return "c"; }
  if (["pass", "p"].includes(nameString2Translate)) { return "p"; }
  if (["restart", "r"].includes(nameString2Translate)) { return "r"; }
  if (["remove", "t"].includes(nameString2Translate)) { return "t"; }
  if (["destroy", "d"].includes(nameString2Translate)) { return "d"; }
  if (["repair", "f"].includes(nameString2Translate)) { return "f"; }
  if (["play", "2"].includes(nameString2Translate)) { return "2"; }
  const [x, y, w, z] = JSON.parse(nameString2Translate);
  if (z === undefined) {
    if (x < 10 && y < 10) { return `${x}${y}`; }
    return `${x},${y}`;
  }
  return `${x},${y},${w},${z}`;
}

/** @param {NS} ns */
function checkIfNewBoard(boardHistory, boardName = '') {
  if (boardHistory === '') { throw Error; }
  if (boardHistory[boardName]) { return false; }
  return true;
}

/** @param {NS} ns */
function moveScore(move = "[-1,-1]" || { type: '' }, testBoard = "W") {
  if (move == "[-1,-1]" || testBoard == "W") { throw Error; }

  let score = testBoard.length;
  if (move === "p" || move === "pass") {
    return score * 10;
  }
  if (move.type || move === "c" || move === "cheat") {
    score += Math.random();
    if (!move.type) { return score * 20; }
    if (move.type === "play") { return score + (30 * testBoard.length + moveScore(move.node1, testBoard) + moveScore(move.node2, testBoard)); }
    if (move.type === "repair") { return score + (20 * testBoard.length + moveScore(move.node, testBoard)); }
    if (move.type === "destroy") { return score + (10 * testBoard.length + moveScore(move.node, testBoard)); }
    if (move.type === "remove") { return score + (0 * testBoard.length + moveScore(move.node, testBoard)); }
    return score;
  }
  // Take in [x,y] position of the move and the boardState, return how much we like the move, bigger is better
  const [xActual, yActual] = JSON.parse(move);
  const testX = xActual + 1, testY = yActual + 1;
  score = Math.trunc(Math.random() * 100 * score) + 1;
  // Stay away from the edges, but don't penalize the corners too much
  {
    const radius = Math.trunc((testBoard.length) / 2);
    for (const axis of [testX, testY]) {
      score *= Math.max(radius - Math.abs(axis - radius), testBoard.length / 4);
    }
  }
  // Prefer moves where x and y add to an even number
  {
    if ((xActual + yActual) / 2 == Math.trunc((xActual + yActual) / 2)) { score *= 2; }
  }
  // Friendly, or empty connections, excluding closing eyes
  {
    let emptyCon = 0, ourCon = 0, foeCon = 0, wallCon = 0, deadCon = 0;
    for (const nodeMod of [-1, 1]) {
      if (testBoard[testX + nodeMod][testY] == ".") { emptyCon++; }
      if (testBoard[testX][nodeMod + testY] == ".") { emptyCon++; }
      if (testBoard[testX + nodeMod][testY] == "X") { ourCon++; }
      if (testBoard[testX][nodeMod + testY] == "X") { ourCon++; }
      if (testBoard[testX + nodeMod][testY] == "O") { foeCon++; }
      if (testBoard[testX][nodeMod + testY] == "O") { foeCon++; }
      if (testBoard[testX + nodeMod][testY] == "W") { wallCon++; }
      if (testBoard[testX][nodeMod + testY] == "W") { wallCon++; }
      if (testBoard[testX + nodeMod][testY] == "#") { deadCon++; }
      if (testBoard[testX][nodeMod + testY] == "#") { deadCon++; }
    }
    if (foeCon + deadCon + wallCon == 4) { score *= 15; }
    if (ourCon + foeCon == 4) { score *= 1.01; }
    if (ourCon > 0 && ourCon + wallCon + deadCon < 3) { score *= 1.5; }
    if ((ourCon == 2 || ourCon == 1) && emptyCon == 2) { score *= 1.2; }
    if (emptyCon > 0) { score *= 1.1; }
    if (foeCon > 0) { score *= 1.1; }
    if (ourCon + deadCon + wallCon == 4) { score *= 0.01; }
    else if (ourCon > 2 && foeCon == 0) { score *= 0.9; }
  }
  // When done modifing the score, return it
  return score;
}

/** @param {NS} ns */
function updateMonkeyDoAndMemory(
  ns,
  turnInfo = { monkey: {}, moveEntries: [['', { r, v }]] },
  gameInfo = { vsNum: -1, newMsgGiven: false }
) {
  if (turnInfo.moveEntries[0][0] === '' || gameInfo.vsNum < 0) { throw Error; }

  const [monkey, moveEntries] = [turnInfo.monkey, turnInfo.moveEntries,];
  const [vsNum] = [gameInfo.vsNum];
  let [newMsgGiven] = [gameInfo.newMsgGiven];

  // If manual isn't allowed, no need to bother
  if (!monkey.See) { return; }

  const temp = [...moveEntries];
  // Ignoring look4Better for monkey.Memory
  temp.sort((a, b) => sortArray(a, b, vsNum, false));
  // Set monkey.Memory
  monkey.Memory = temp[0][1];
  monkey.Memory.moveName = temp[0][0];
  // keep monkey.Do?
  if (monkey.Do && temp[0][1].r <= 0) {
    monkey.Do = false; monkey.Lie = true;
    if (!newMsgGiven) { newMsgGiven = true; ns.print(`No positive Win Ratio, turning on manual`); }
  }
}

/** @param {NS} ns */
function sortArray(a, b, vsNum, look4Better) {
  a = a[1], b = b[1]
  if (look4Better) {
    if (a.r == 0 && b.r != 0) { return -1; }
    if (b.r == 0 && a.r != 0) { return 1; }
  }
  if ((a.v >= vsNum && a.r >= 0) && !(b.v >= vsNum && b.r >= 0)) { return -1; }
  if ((b.v >= vsNum && b.r >= 0) && !(a.v >= vsNum && a.r >= 0)) { return 1; }
  if (a.r !== b.r) { return b.r - a.r; }
  return b.score - a.score;
}

/** @param {NS} ns */
async function passTurn(go, gameInfo) {
  try { gameInfo.moveResult = await go.passTurn(); }
  catch { gameInfo.moveResult.type = "invalid"; }
}

/** @param {NS} ns */
async function makeMove(go, JSONMoveString, gameInfo) {
  let [x, y] = JSON.parse(JSONMoveString);
  try { gameInfo.moveResult = await go.makeMove(x, y); }
  catch { gameInfo.moveResult.type = "invalid"; }
}

/** @param {NS} ns */
async function removePassingSuggestion(ns, vs) {
  const logs = ns.getScriptLogs();
  const lastLog = logs[logs.length - 1];
  if (lastLog.includes(`${vs}: `)) { return; }

  const go = ns.go;
  await go.opponentNextTurn();
  const newLastLog = ns.getScriptLogs().pop();
  if (newLastLog.includes("You can end the game by passing as well.")) {
    const allTheLogs = newLastLog.split("You can end the game by passing as well.")
    ns.clearLog();
    logs.push(allTheLogs[0]);
    for (const log of logs) {
      ns.print(log);
    }
  }
}

/** @param {NS} ns */
async function recordScoreAndReturnPlayAgain(
  ns,
  boardHistory,
  boardHistoryFile,
  playAgain,
  gameInfo = { movesMade: [], vs: '', vsNum: -1, weWon: false },
  Options,
  colours
) {
  if (gameInfo.vsNum < 0) { throw Error; }

  const [movesMade, vs, vsNum] = [gameInfo.movesMade, gameInfo.vs, gameInfo.vsNum];

  if (!(movesMade.length > 1)) {
    boardHistoryFile.write(boardHistory);
    ns.print(`${colours.yellow}New Game+`);
    ns.print("---------------------------------------------------");
    return true;
  }
  const log = ns.getScriptLogs().pop();
  if (!log.includes(`${vs}: `)) {
    debugger;
    boardHistoryFile.write(boardHistory);
    ns.print(`${colours.red}Game Results Not Found ${colours.yellow}New Boards Saved`);
    ns.print("---------------------------------------------------");
    return await askToPlayAgain(ns, Options, playAgain);
  }
  const foeScore =
    eval(log.slice(log.lastIndexOf(`${vs}: `) + `${vs}: `.length, log.lastIndexOf(`,  Player: `)));
  const ourScore =
    eval(log.slice(log.lastIndexOf(`,  Player: `) + `,  Player: `.length));
  if (!isFinite(foeScore) || !isFinite(ourScore) || foeScore <= 0) {
    if (foeScore == 0) { ns.print(`${colours.yellow}Game Results Discarded`); }
    else { ns.print(`${colours.red}Game Results Discarded`); }
    ns.print("---------------------------------------------------");
    return await askToPlayAgain(ns, Options, playAgain);
  }
  if (movesMade[movesMade.length - 1].moveMade === "p") { movesMade.pop(); }
  let progressWithinMovesMade = 1, killMe = false, updatedScores = 0;
  for (const turn of movesMade) {
    if (Options.debuging) { debugger; }
    if (!boardHistory[turn.boardName][turn.moveMade]) {
      if (turn.moveMade === "r") { progressWithinMovesMade++; continue; }
      if (turn.moveMade === "c") { boardHistory[turn.boardName][turn.moveMade] = {} }
      boardHistory[turn.boardName][turn.moveMade] = { r: 0, v: 0 };
    }
    const bHbNmM = boardHistory[turn.boardName][turn.moveMade];
    const newRatio = Math.round((ourScore - foeScore) * (progressWithinMovesMade / movesMade.length) * 10000) / 10000;
    if (turn.moveMade === "c") {
      const cI = turn.cheatInfo;
      if (cI.success) { cI.success = 1; } else { cI.success = 0.25; }
      if (!bHbNmM[cI.what]) { bHbNmM[cI.what] = {}; }
      if (!bHbNmM[cI.what][cI.node]) {
        bHbNmM[cI.what][cI.node] = { r: newRatio * cI.success, v: vsNum };
        updatedScores++; progressWithinMovesMade++; continue;
      }
      // If history for this cheatMove exists
      const short = bHbNmM[cI.what][cI.node];
      if (vsNum > short.v) {
        short.r = Math.round(newRatio * cI.success * 1000) / 1000;
        short.v = vsNum;
        updatedScores++; progressWithinMovesMade++; continue;
      }
      if (vsNum == short.v) {
        if (Options.look4Better && short.r > newRatio) {
          short.r = Math.round(((short.r * 0.99) + (newRatio * cI.success * 0.01)) * 1000) / 1000;
          updatedScores++; progressWithinMovesMade++; continue;
        }
        short.r = Math.round(((short.r * 0.8) + (newRatio * cI.success * 0.2)) * 1000) / 1000;
        updatedScores++; progressWithinMovesMade++; continue;
      }
      if (vsNum < short.v) { progressWithinMovesMade++; continue; }
      progressWithinMovesMade++; killMe = true; continue;
    }
    // if wasn't a cheatMove
    if (vsNum > bHbNmM.v) {
      bHbNmM.r = Math.round(newRatio * 1000) / 1000;
      bHbNmM.v = vsNum;
      updatedScores++; progressWithinMovesMade++; continue;
    }
    if (vsNum == bHbNmM.v) {
      if (Options.look4Better && bHbNmM.r > newRatio) {
        bHbNmM.r = Math.round(((bHbNmM.r * 0.99) + (newRatio * 0.01)) * 1000) / 1000;
        updatedScores++; progressWithinMovesMade++; continue;
      }
      bHbNmM.r = Math.round(((bHbNmM.r * 0.8) + (newRatio * 0.2)) * 1000) / 1000;
      updatedScores++; progressWithinMovesMade++; continue;
    }
    if (vsNum < bHbNmM.v) { progressWithinMovesMade++; continue; }
    progressWithinMovesMade++; killMe = true;
  }
  boardHistoryFile.write(boardHistory);
  if (ourScore > foeScore) {
    gameInfo.weWon = true;
    ns.print(`${colours.green}${updatedScores}/${movesMade.length} Game Results Updated`);
  }
  else { ns.print(`${colours.yellow}${updatedScores}/${movesMade.length} Game Results Updated`); }
  if (killMe) { ns.exit(); }
  ns.print("---------------------------------------------------");
  return await askToPlayAgain(ns, Options, playAgain);
}

/** @param {NS} ns */
async function askToPlayAgain(ns, Options, playAgain) {
  if (!Options.playForever) { playAgain = await ns.prompt("Play another game?"); }
  return playAgain;
}

/** @param {NS} ns */
async function pruneBoardHistory(ns, boardHistory, Options, colours) {
  let [i, dBoards, dMoves, cleaning] = [0, 0, 0, "cleaning"];
  if (Options.debuging) { debugger; }
  if (Object.keys(boardHistory).length <= 200000) {
    for (const board of Object.entries(boardHistory)) {
      i++; let noGood = true;
      for (const move of Object.entries(board[1])) {
        if (move[0] !== "c") {
          if (move[1].r > 0) { noGood = false; continue; }
          delete boardHistory[board[0]][move[0]]; dMoves++; continue;
        }
        for (const cheatMoveType of Object.entries(move[1])) {
          let typeNoGood = true;
          for (const cheatMove of Object.entries(cheatMoveType[1])) {
            if (cheatMove[1].r > 0) { typeNoGood = false; continue; }
            delete boardHistory[board[0]][move[0]][cheatMoveType[0]][cheatMove[0]]; dMoves++;
          }
          if (!typeNoGood) { noGood = false; continue; }
          delete boardHistory[board[0]][move[0]][cheatMoveType[0]];
        }
      }
      if (noGood) { delete boardHistory[board[0]]; dBoards++; }
      if (i > 1e6) { i = 0; await ns.sleep(); }
    }
    if (dMoves > 0 || dBoards > 0) {
      ns.print(`${colours.yellow}Doing some ${cleaning}...`);
      ns.print(`Deleted ${ns.formatNumber(dBoards, 0)} Boards and ${ns.formatNumber(dMoves, 0)} Moves`);
      ns.print("---------------------------------------------------");
    }
    if (Options.debuging) { debugger; }
    return;
  }
  // if boardHistory is big
  cleaning = "major cleaning";
  for (const board of Object.entries(boardHistory)) {
    i++; let noGood = true;
    let movesInBoard = 0;
    let best = { name: null, r: 0, v: 0 };
    let bestCheat = { type: null, name: null, r: 0, v: 0 };
    for (const move of Object.entries(board[1])) {
      if (move[0] !== "c") {
        movesInBoard++;
        if (move[1].v >= best.v && move[1].r > best.r) { noGood = false; best = { name: move[0], r: move[1].r, v: move[1].v }; }
        continue;
      }
      for (const cheatMoveType of Object.entries(move[1])) {
        let typeNoGood = true;
        let movesInType = 0;
        for (const cheatMove of Object.entries(cheatMoveType[1])) {
          movesInType++;
          if (cheatMove[1].v < bestCheat.v || cheatMove[1].r <= bestCheat.v) { continue; }
          typeNoGood = false;
          bestCheat = { type: cheatMoveType[0], name: cheatMove[0], r: cheatMove[1].r, v: cheatMove[1].v };
        }
        if (!typeNoGood) { noGood = false; continue; }
        delete boardHistory[board[0]][move[0]][cheatMoveType[0]];
        dMoves += movesInType;
      }
    }
    if (noGood) {
      delete boardHistory[board[0]]; dBoards++; dMoves += movesInBoard;
      continue;
    }
    for (const move of Object.entries(board[1])) {
      if (move[0] !== "c") {
        if (move[0] != best.name || best.r < bestCheat.r) {
          delete boardHistory[board[0]][move[0]]; dMoves++;
        }
        continue;
      }
      if (bestCheat.r < best.r) { delete boardHistory[board[0]][move[0]]; continue; }
      for (const cheatMoveType of Object.entries(move[1])) {
        if (cheatMoveType[0] != bestCheat.type) { delete boardHistory[board[0]][move[0]][cheatMoveType[0]]; continue; }
        for (const cheatMove of Object.entries(cheatMoveType[1])) {
          if (cheatMove[0] != bestCheat.name) { delete boardHistory[board[0]][move[0]][cheatMoveType[0]][cheatMove[0]]; }
        }
      }
    }
    if (i > 1e6) { i = 0; await ns.sleep(); }
  }
  if (dMoves > 0 || dBoards > 0) {
    ns.print(`${colours.yellow}Doing some ${cleaning}...`);
    ns.print(`Deleted ${ns.formatNumber(dBoards, 0)} Boards and ${ns.formatNumber(dMoves, 0)} Moves`);
    ns.print("---------------------------------------------------");
  }
  if (Options.debuging) { debugger; }
}

/** @param {NS} ns */
async function summonCheats(ns, scriptInfo, colours, CustomInitText = `Cheats initalizing`) {
  let childPort = ns.run("go/cheat.js", { temporary: true }, scriptInfo.MotherPort);
  ns.print(CustomInitText);
  if (!childPort) {
    ns.print(`${colours.yellow}... Waiting for space ...`);
    while (!childPort) {
      await ns.sleep();
      childPort = ns.run("go/cheat.js", { temporary: true }, scriptInfo.MotherPort);
    }
  }
  return childPort;
}