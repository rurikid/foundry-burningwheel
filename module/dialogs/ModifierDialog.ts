import { Ability, BWActor } from "../actors/BWActor.js";
import { difficultyGroup, TestString } from "../helpers.js";
import * as constants from "../constants.js";
import { Skill } from "../items/skill.js";
import { BWCharacter } from "../actors/BWCharacter.js";
import { simpleBroadcast } from "../chat.js";

export class ModifierDialog extends Application {

    mods: {name: string, amount: number }[];
    help: HelpRecord[];
    editable: boolean;

    constructor(mods?: {name: string, amount: number}[], help?: HelpRecord[] ) {
        super({
            template: "systems/burningwheel/templates/dialogs/mods-and-help.hbs",
            popOut: false
        });

        this.mods = mods || [];
        this.help = help || [];
        this.editable = game.user.isGM;
    }

    addHelp({ dice, skillId, path, difficulty, title, actor }: AddHelpOptions): void {
        const entry: HelpRecord = {
            title,
            dice: dice >= 5 ? 2 : 1,
            skillId,
            path,
            difficulty,
            actorId: actor.id
        };
        this.help.push(entry);
        this.persistData();
        this.syncData();
        this.render();
    }

    grantTests(obstacle: number, success: boolean): void {
        if (game.user.isGM) {
            this._grantTests(obstacle, success);
        } else {
            game.socket.emit(constants.socketName, { type: "grantHelpTests", obstacle, success });
        }
    }

    private _grantTests(obstacle: number, success: boolean): void {
        const testListing: { title?: string, text?: string }[] = [];
        this.help.forEach((entry) => {
            let name = "";
            let diff: TestString = "Routine";
            if (entry.path) {
                const actor = game.actors.get(entry.actorId) as BWActor;
                name = entry.path.substr(entry.path.indexOf('.') + 1).titleCase();
                const ability = getProperty(actor.data, entry.path) as Ability & { name?: string };
                diff = difficultyGroup(ability.exp, obstacle);
                if (name === "Custom1" || name === "Custom2") {
                    name = ability.name || name;
                }

                if (actor.data.type === "character") {
                    (actor as BWCharacter).addStatTest(ability, name, entry.path, diff, success);
                }
            } else {
                const skill = game.actors.get(entry.actorId).getOwnedItem(entry.skillId || "") as Skill;
                diff = difficultyGroup(skill.data.data.exp, obstacle);
                skill.addTest(diff);
                name = skill.name;
            }
            testListing.push({
                title: entry.title,
                text: `A ${diff} ${name} test at Ob ${obstacle}`
            });
        });
        this.help = [];
        this.persistData();
        this.syncData();
        this.render();

        if (testListing.length) {
            simpleBroadcast({
                title: "Tests Granted for Helping",
                mainText: "For their assistance in the test, the following tests have been granted.",
                extraData: testListing
            });
        }
    }

    get helpDiceTotal(): number {
        return this.help.map(h => h.dice).reduce((t, d) => t + d);
    }

    activateListeners(html: JQuery): void {
        html.find('input[name="newMod"]').on('change', e => {
            const target = $(e.target);
            const name = target.val() as string;
            target.val("");
            this.mods.push({ name, amount: 0});
            this.render();
        });

        html.find('input.mod-name').on('change', e => {
            const target = $(e.target);
            const name = target.val() as string;
            const index = parseInt(e.target.dataset.index || "0");
            if (name) {
                this.mods[index].name = name;
            } else {
                this.mods.splice(index, 1);
            }
            this.persistData();
            this.syncData();
            this.render();
        });

        html.find('input.mod-amount').on('change', e => {
            const target = $(e.target);
            const amount = parseInt(target.val() as string) || 0;
            const index = parseInt(e.target.dataset.index || "0");
            this.mods[index].amount = amount;
            this.persistData();
            this.syncData();
            this.render();
        });

        html.find('i[data-action="delete"]').on('click', e => {
            const target = e.currentTarget;
            const index = parseInt(target.dataset.index || "0");
            this.help.splice(index, 1);
            this.persistData();
            this.syncData();
            this.render();
        });

        game.socket.on(constants.socketName, ({type, mods, help}) => {
            if (type === "modifierData") {
                this.mods = mods;
                this.help = help;
                this.persistData();
                this.render(true);
            }
        });

        game.socket.on(constants.socketName, ({type, obstacle, success}) => {
            if (type === "grantHelpTests") {
                this._grantTests(obstacle, success);
            }
        });
    }
    
    persistData(): void {
        if (game.user.isGM) {
            game.settings.set(constants.systemName, constants.settings.obstacleList, JSON.stringify({ mods: this.mods, help: this.help }));
        }
    }

    syncData(): void {
        game.socket.emit(constants.socketName, { type: "modifierData", mods: this.mods, help: this.help });
    }

    getData(): DifficultyDialogData {
        const data = super.getData() as DifficultyDialogData;
        data.editable = this.editable;
        data.modifiers = this.mods;
        data.help = this.help;
        data.showHelp = this.help.length > 0;

        return data;
    }
}

interface DifficultyDialogData {
    editable: boolean;
    extendedTest: boolean;
    modifiers: { name: string; amount: number; }[];
    help: HelpRecord[];
    showHelp: boolean;
}

interface HelpRecord {
    title: string;
    path?: string;
    skillId?: string;
    difficulty: TestString;
    dice: number;
    actorId: string;
}

export interface AddHelpOptions {
    actor: BWActor,
    title: string,
    path?: string;
    skillId?: string,
    difficulty: TestString,
    dice: number
}
