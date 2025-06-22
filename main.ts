import * as path from "jsr:@std/path";
import chalk from 'npm:chalk';

function getConfigPath() {
    // Use the user's home directory for config
    const home = Deno.env.get("HOME") || Deno.env.get("USERPROFILE") || ".";
    return path.join(home, "rugplay_api_saves.json");
}

function readConfig() {
    const filePath = getConfigPath();
    return JSON.parse(Deno.readTextFileSync(filePath));
}

function writeConfig(config: Record<string, any>) {
    const filePath = getConfigPath();
    // Ensure directory exists (should always exist for home, but just in case)
    const dir = path.dirname(filePath);
    try {
        Deno.statSync(dir);
    } catch (_) {
        try {
            Deno.mkdirSync(dir, { recursive: true });
        } catch {
            // ignore
        }
    }
    return Deno.writeTextFileSync(filePath, JSON.stringify(config), {
        create: true,
    });
}

interface Command {
    desc: string;
    args: string;
    callback: (args: string[]) => Promise<void>;
}

let config = {cookie:"unknown"};
try {
    config = readConfig();
} catch (err) {
    console.log("Couldn't read configuration file:");
    console.log(err);
    console.log("Wrote default file.");
    writeConfig(config);
}

// deno-lint-ignore no-explicit-any
export async function api_req(api: string, method: string, body?: any): Promise<Response|undefined> {
    if (config.cookie == "unknown") {
        console.log(`${chalk.redBright('You')} ${chalk.bold('must')} ${chalk.redBright('have a cookie set to use this.')}`);
        return undefined;
    }
    return await fetch(
        "https://rugplay.com/api/"+api,
        {
            method,
            headers: {
                //? Fake user agent I got from Gemini
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
                "Cookie": config.cookie,
                "Accept-Language": "en-US,en;q=0.9", //? Assuming English
                "Origin": "https://rugplay.com", //? Make the Rugplay API think we're from the rugplay website
            },
            body,
        }
    );
}

const slot_record: Record<string, string> = {
    wattesigma: "◻️",
    webx: "⬛",
    twoblade: "🟥",
    lyntr: "🟪",
    bussin: "🟧",
    subterfuge: "🟩",
};

async function mk_file(path: string): Promise<File> {
    const fileBytes = await Deno.readFile(path);
    const fileInfo = await Deno.stat(path);
    const name = path.split('/').pop();
    const t = 'image/'+path.split('.').pop();
    const blob = new Blob([fileBytes], { type: t });
    return new File([blob], name as string, {
        type: t,
        lastModified: fileInfo.mtime ? fileInfo.mtime.getTime() : Date.now(),
    });
}

// deno-lint-ignore no-explicit-any
async function me(): Promise<Record<any, any>|undefined> {
    const req = await fetch(
        "https://rugplay.com/__data.json?x-sveltekit-trailing-slash=1&x-sveltekit-invalidated=10",
        {
            method: "GET",
            headers: {
                //? Fake user agent I got from Gemini
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
                "Cookie": config.cookie,
                "Accept-Language": "en-US,en;q=0.9", //? Assuming English
                "Origin": "https://rugplay.com", //? Make the Rugplay API think we're from the rugplay website
            },
        }
    )
    if (!req.ok) {
        console.log(`${chalk.redBright('API ERROR')}:`);
        console.log(await req.text());
        return undefined;
    }

    return await req.json();
}

let commands: Map<string, Command> = new Map()
    .set("commands", {
        desc: "lists commands",
        args: [], callback: async (args: string[]): Promise<void> => {
            console.log("Available commands:");
            for (const [k,v] of commands) {
                let args_buf = "";
                for (let i=0; i<v.args.length; i++) {
                    args_buf += v.args[i];
                    if (i+1<v.args.length) {
                        args_buf += ", ";
                    }
                }
                console.log(`${chalk.bold(k)}(${args_buf}):`, v.desc);
            }
        }
    })
    .set("set-cookie", { 
        desc: "sets your cookie for API requests, you can find this in the request headers on rugplay.com in network",
        args: ["new-cookie"], callback: async (args: string[]): Promise<void> => {
            let cookie = args.shift();
            while (args.length >= 1) {
                cookie += ` ${args.shift()}`;
            }
            config.cookie = cookie as string;
            console.log(`Set cookie ${chalk.greenBright('successfully')}.`);
            writeConfig(config);
        }
    })
    .set("coinflip", {
        desc: "attempts a coinflip on your account with the given side (0=heads, 1=tails) and amount",
        args: ["attempted-side", "amount"], callback: async (args: string[]): Promise<void> => {
            const side = args.shift()=='1'?'tails':'heads';
            const amount = parseFloat(args.shift()??'0.01');
            const a = await api_req(
                'gambling/coinflip',
                'POST',
                JSON.stringify({ side, amount })
            );
            if (a==undefined) {
                return;
            }
            if (!a.ok) {
                console.log(`${chalk.redBright('API ERROR')}:`);
                console.log(await a.text());
                return;
            }
            const json = await a.json();
            if (!json.won) {
                console.log(`You ${chalk.redBright('lost')}.`);
                console.log(`New balance: ${chalk.yellowBright('$')}${chalk.yellow(Math.round(json.newBalance*1000)/1000)} (-${chalk.redBright(amount)})`);
            } else {
                console.log(`You ${chalk.greenBright('won')}!`);
                console.log(`New balance: ${chalk.yellowBright('$')}${chalk.yellow(Math.round(json.newBalance*1000)/1000)} (+${chalk.yellowBright(json.payout)})`);
            }
        }
    })
    .set("slots", {
        desc: "attempts a slot machine roll on your account with the given amount",
        args: ["amount"], callback: async (args: string[]): Promise<void> => {
            const amount = parseFloat(args.shift()??'0.01');
            const a = await api_req(
                'gambling/slots',
                'POST',
                JSON.stringify({ amount })
            );
            if (a==undefined) {
                return;
            }
            if (!a.ok) {
                console.log(`${chalk.redBright('API ERROR')}:`);
                console.log(await a.text());
                return;
            }
            const json = await a.json();
            console.log(slot_record[json.symbols[0]], slot_record[json.symbols[1]], slot_record[json.symbols[2]]);
            if (!json.won) {
                console.log(`You ${chalk.redBright('lost')}.`);
                console.log(`New balance: ${chalk.yellowBright('$')}${chalk.yellow(Math.round(json.newBalance*1000)/1000)} (-${chalk.redBright(amount)})`);
            } else {
                console.log(`You ${chalk.greenBright('won')}!`);
                console.log(`New balance: ${chalk.yellowBright('$')}${chalk.yellow(Math.round(json.newBalance*1000)/1000)} (+${chalk.yellowBright(json.payout)})`);
            }
        }
    })
    .set("summary", {
        desc: "returns a summary of your portfolio",
        args: [], callback: async (_args: string[]): Promise<void> => {
            const a = await api_req(
                'portfolio/summary',
                'GET'
            );
            if (a==undefined) {
                return;
            }
            if (!a.ok) {
                console.log(`${chalk.redBright('API ERROR')}:`);
                console.log(await a.text());
                return;
            }
            const json = await a.json();
            console.log(`${chalk.bold('Portfolio')} Summary`);
            console.log(`Balance: ${chalk.yellowBright('$')}${chalk.yellow(Math.round(json.baseCurrencyBalance*1000)/1000)}`);
            console.log(`Total coin value: ${chalk.yellowBright('$')}${chalk.yellow(Math.round(json.totalCoinValue*1000)/1000)}`);
            console.log(`Total value: ${chalk.yellowBright('$')}${chalk.yellow(Math.round(json.totalValue*1000)/1000)}`);
        }
    })
    .set("redeem", {
        desc: "redeems promotion code",
        args: ["code"], callback: async (args: string[]): Promise<void> => {
            const a = await api_req(
                'promo/verify',
                'POST',
                JSON.stringify({ code: args.shift() })
            );
            if (a==undefined) {
                return;
            }
            if (!a.ok) {
                console.log(`${chalk.redBright('API ERROR')}:`);
                console.log(await a.text());
                return;
            }
            const json = await a.json();
            console.log(json.message);
        }
    })
    .set("new-coin", {
        desc: "attempts to create a new coin",
        args: ["name", "symbol", "icon-path"], callback: async (args: string[]): Promise<void> => {
            if (args.length != 3) {
                console.log('Invalid argument length');
                return;
            }
            const form = new FormData();
            form.append('name', args.shift() as string);
            form.append('symbol', args.shift() as string);
            try {
                form.append('icon', await mk_file(args.shift() as string));
            } catch (e) {
                console.log(`${chalk.redBright('Error whilst creating logo file')}:`);
                console.log(e);
                return;
            }

            const a = await api_req(
                'coin/create',
                'POST',
                form
            );
            if (a==undefined) {
                return;
            }
            if (!a.ok) {
                console.log(`${chalk.redBright('API ERROR')}:`);
                console.log(await a.text());
                return;
            }
            const json = await a.json();
            console.log(`${chalk.greenBright('Created')} ${chalk.bgWhite(json.coin.symbol)} (-${chalk.redBright(json.feePaid)})\n${json.message}`);
        }
    })
    .set("settings", {
        desc: "updates your user settings (set fields to 'none' if you don't want to update them) note: updating the profile picture is slow and takes 10-20 minutes for Rugplay to update it, also it takes a path on your computer",
        args: ["name", "username", "avatar", "bio"], callback: async (args: string[]): Promise<void> => {
            if (args.length < 4) {
                console.log('Invalid command parameters');
                return;
            }

            const u = await me();
            if (u==undefined) {
                return;
            }
            
            const form = new FormData();
            const name = args.shift() as string;
            if (name != 'none') {
                form.append('name', name);
            } else {
                form.append('name', u.nodes[0].data[3]);
            }
            const user = args.shift() as string;
            if (user != 'none') {
                form.append('username', user);
            }
            const filePath = args.shift() as string;
            if (filePath != 'none') {
                try {
                    form.append('avatar', await mk_file(filePath));
                } catch (err) {
                    console.log(`${chalk.redBright('Error whilst creating File:')}`);
                    console.log(err);
                    return;
                }
            }
            let bio = args.shift() as string;
            if (bio != 'none') {
                while (args.length >= 1) {
                    bio += ` ${args.shift()}`;
                }
                form.append('bio', bio);
            }
            const a = await api_req(
                'settings',
                'POST',
                form
            );
            if (a==undefined) {
                return;
            }
            if (!a.ok) {
                console.log(`${chalk.redBright('API ERROR')}:`);
                console.log(await a.text());
                return;
            }
            console.log(chalk.greenBright('Updated settings'));
        }
    })
    .set("me", {
        desc: "returns things like your username, id, etc.",
        args: [], callback: async (_args: string[]): Promise<void> => {
            const json = await me();
            if (json==undefined) {
                return;
            }
            console.log(`${chalk.bold(json.nodes[0].data[3])} ${chalk.italic('(@'+json.nodes[0].data[4]+')')}\n${json.nodes[0].data[10]}`);
        }
    })
    .set("daily-reward", {
        desc: "attempts to claim daily reward",
        args: [], callback: async (_args: string[]): Promise<void> => {
            const a = await api_req(
                'rewards/claim',
                'POST'
            );
            if (a==undefined) {
                return;
            }
            if (!a.ok) {
                console.log(`${chalk.redBright('API ERROR')}:`);
                console.log(await a.text());
                return;
            }
            const json = await a.json();
            console.log(`${chalk.greenBright('Redeemed')} ${json.totalRewardsClaimed} rewards\nNew balance: ${chalk.yellow('$')}${chalk.yellowBright(json.newBalance)} (+${chalk.yellowBright(json.rewardAmount)})`);
        },
    })
    .set("notifications", {
        desc: "lists notifications",
        args: [], callback: async (_args: string[]): Promise<void> => {
            const a = await api_req(
                'notifications',
                'GET'
            );
            if (a==undefined) {
                return;
            }
            if (!a.ok) {
                console.log(`${chalk.redBright('API ERROR')}:`);
                console.log(await a.text());
                return;
            }
            const json = await a.json();
            console.log(`${chalk.bold("Notifications")} ${chalk.bgRedBright(json.unreadCount)}`);
            console.log(`${chalk.italic('Unread')}`);
            for (const notif of json.notifications) {
                if (!notif.isRead) {
                    console.log(`${chalk.bold(notif.title)}\n${notif.message}`);
                }
            }
            console.log(`${chalk.italic('Read')}`);
            for (const notif of json.notifications) {
                if (notif.isRead) {
                    console.log(`${chalk.bold(notif.title)}\n${notif.message}`);
                }
            }
        }
    })
    .set("invest", {
        desc: "invests in the most possible coins with a given budget and amount to spend on each coin",
        args: ["budget", "amt", "page"], callback: async (args: string[]): Promise<void> => {
            if (args.length < 2) {
                console.log("Invald paramteres to command");
                return;
            }

            const budget = parseFloat(args.shift() as string);
            if (Number.isNaN(budget)) {
                return;
            }
            const amount = parseFloat(args.shift() as string);
            if (Number.isNaN(amount)) {
                return;
            }
            const limit = Math.floor(budget/amount);
            const page = args.length == 0 ? "1" : args.shift();
            let a = await api_req(
                `market?search=&sortBy=marketCap&sortOrder=desc&priceFilter=all&changeFilter=all&page=${page}&limit=${limit}`,
                'GET'
            );
            if (a==undefined) {
                return;
            }
            if (!a.ok) {
                console.log(`${chalk.redBright('API ERROR')}:`);
                console.log(await a.text());
                return;
            }
            const json = await a.json();
            console.log(`Investing in ${chalk.greenBright(limit)} coins at the top of the marketplace`);
            for (let i = 0; i<limit; i++){
                const symbol = json.coins[i].symbol;
                a = await api_req(
                    `coin/${symbol}/trade`,
                    'POST',
                    JSON.stringify({ type: "BUY", amount })
                );
                if (a==undefined) {
                    return;
                }
                if (!a.ok) {
                    console.log(`${chalk.redBright('API ERROR')}:`);
                    console.log(await a.text());
                    return;
                }
                console.log(` Invested in ${chalk.bgWhite(symbol)} (-${chalk.redBright(amount)})`);
            }
        }
    })
    .set("view-user", {
        desc: "views a user's stats by username (not display name)",
        args: ["user"], callback: async (args: string[]): Promise<void> => {
            if (args.length != 1) {
                console.log("Invalid parameters to command");
                return;
            }
            const a = await api_req(
                `user/${args.shift()}`,
                'GET'
            );
            if (a == undefined) {
                return;
            }
            if (!a.ok) {
                console.log(`${chalk.redBright('API ERROR')}:`);
                console.log(await a.text());
                return;
            }
            const json = await a.json();
            console.log(`${chalk.bold(json.profile.name)} (@${chalk.italic(json.profile.username)}) ${json.profile.isAdmin==true ? chalk.bgRedBright('ADMIN') : ''}`);
            console.log(json.profile.bio);
            console.log(`Total portfolio: ${chalk.yellowBright('$')}${chalk.yellow(Math.round(json.stats.totalPortfolioValue*1000)/1000)}`);
            console.log(`Illiquid value: ${chalk.yellowBright('$')}${chalk.yellow(Math.round(json.stats.holdingsValue*1000)/1000)}`);
            console.log(`Liquid value: ${chalk.yellowBright('$')}${chalk.yellow(Math.floor(json.profile.baseCurrencyBalance*1000)/1000)}`);
            console.log(`Buy volume: ${chalk.yellowBright('$')}${chalk.yellow(Math.floor(json.stats.totalBuyVolume))}`);
            console.log(`Sell volume: ${chalk.yellowBright('$')}${chalk.yellow(Math.floor(json.stats.totalSellVolume*1000)/1000)}`);
            console.log(`${json.stats.coinsCreated} created coins`);
            if (json.createdCoins > 0) {
                console.log('  Symbol (Name) | Price | 24h Change | Market cap');
            }
            for (const c of json.createdCoins) {
                let dayChange;
                if (c.change24h > 0) {
                    dayChange = `${chalk.bgGreen('^ '+c.change24h)}`
                } else if (c.change24h == 0) {
                    dayChange = `${chalk.bgGray('- '+c.change24h)}`
                } else {
                    dayChange = `${chalk.bgRedBright('v '+c.change24h)}`
                }
                console.log(`  ${chalk.bgWhite()} (${chalk.name}) | ${chalk.yellow('$')}${chalk.yellowBright(Math.round(c.currentPrice*1000)/1000)} | ${dayChange} | ${Math.floor(c.marketCap*1000)/1000}`);
            }
            console.log('Recent transactions');
            for (const t of json.recentTransactions) {
                switch (t.type) {
                    case "BUY": {
                        console.log(`  ${chalk.bgGreen('Buy')} ${Math.round(t.quantity*1000)/1000} ${chalk.bgWhite(t.coinSymbol)} for ${chalk.yellow("$")}${chalk.yellowBright(t.totalBaseCurrencyAmount)}`);
                        break;
                    }
                    case "TRANSFER_OUT": {
                        console.log(`  ${chalk.bgBlue('Transferred')} ${t.coinName == "LINKCOIN" ? `${chalk.yellow('$')}${chalk.yellowBright(Math.round(t.totalBaseCurrencyAmount*1000)/1000)}` : `${Math.round(t.quantity*1000)/1000} ${chalk.bgWhite(t.coinSymbol)}`} to ${chalk.bold(t.recipientUsername)} `);
                        break;
                    }
                    case "SELL": {
                        console.log(`  ${chalk.bgRedBright('Sell')} ${Math.round(t.quantity*1000)/1000} ${chalk.bgWhite(t.coinSymbol)} for ${chalk.yellow("$")}${chalk.yellowBright(t.totalBaseCurrencyAmount)}`);
                        break;
                    }
                    case "TRANSFER_IN": {
                        console.log(`  ${chalk.bgBlue('Received')} ${t.coinName == "LINKCOIN" ? `${chalk.yellow('$')}${chalk.yellowBright(Math.round(t.totalBaseCurrencyAmount*1000)/1000)}` : `${Math.round(t.quantity*1000)/1000} ${chalk.bgWhite(t.coinSymbol)}`} from ${chalk.bold(t.senderUsername)}`);
                    }
                }
            }
        }
    })
    .set("market", {
        desc: "searches the market for the given search term or lists the top coins",
        args: ["page", "search-item"], callback: async (args: string[]): Promise<void> => {
            const page = args.shift() ?? '1';
            let item = args.shift() ?? '';
            while (args.length >= 1) {
                item += ` ${args.shift()}`;
            }
            item = encodeURIComponent(item);
            const a = await api_req(
                `market?search=${item}&sortBy=marketCap&sortOrder=desc&priceFilter=all&changeFilter=all&page=${page}&limit=6`,
                'GET'
            );
            if (a==undefined) {
                return;
            }
            if (!a.ok) {
                console.log(`${chalk.redBright('API ERROR')}:`);
                console.log(await a.text());
                return;
            }
            const json = await a.json();
            console.log(`${chalk.bold('Market')} (page ${page} of ${json.totalPages})`);
            console.log('  Symbol (Name) | Current price | Change 24h | Market cap | Creator name');
            for (const c of json.coins) {
                let dayChange;
                if (c.change24h > 0) {
                    dayChange = `${chalk.bgGreen('^ '+c.change24h)}`
                } else if (c.change24h == 0) {
                    dayChange = `${chalk.bgGray('- '+c.change24h)}`
                } else {
                    dayChange = `${chalk.bgRedBright('v '+c.change24h)}`
                }
                console.log(`  ${chalk.bgWhite(c.symbol)} (${c.name}) | ${chalk.yellowBright('$')}${chalk.yellow(Math.round(c.currentPrice*1000)/1000)} | ${dayChange} | ${c.marketCap} | @${chalk.bold(c.creatorName)}`);
            }
        }
    })
    .set("buy-coin", {
        desc: "buys the given coin (by symbol) with the given amount",
        args: ["symbol", "amount"], callback: async (args: string[]): Promise<void> => {
            if (args.length != 2) {
                console.log('Invalid command parameters');
                return;
            }
            const coin = args.shift();
            const amount = args.shift();
            const a = await api_req(
                `coin/${coin}/trade`,
                'POST',
                JSON.stringify({ type: "BUY", amount: parseFloat(amount as string) })
            );
            if (a==undefined) {
                return;
            }
            if (!a.ok) {
                console.log(`${chalk.redBright('API ERROR')}:`);
                console.log(await a.text());
                return;
            }
            const result = await a.json();
            console.log(`Bought ${result.coinsSold} ${chalk.bgWhite(coin)} ${chalk.greenBright('successfully')}.`);
            console.log(`New balance: ${chalk.yellow('$')}${chalk.yellowBright(result.newBalance)} (-${chalk.redBright(amount)})`);
        }
    })
    .set("sell-coin", {
        desc: "buys the given coin (by symbol) with the given amount",
        args: ["symbol", "amount"], callback: async (args: string[]): Promise<void> => {
            if (args.length != 2) {
                console.log('Invalid command parameters');
                return;
            }
            const coin = args.shift();
            const amount = args.shift();
            const a = await api_req(
                `coin/${coin}/trade`,
                'POST',
                JSON.stringify({ type: "SELL", amount: parseFloat(amount as string) })
            );
            if (a==undefined) {
                return;
            }
            if (!a.ok) {
                console.log(`${chalk.redBright('API ERROR')}:`);
                console.log(await a.text());
                return;
            }
            const result = await a.json();
            console.log(`Sold ${result.coinsSold} ${chalk.bgWhite(coin)} ${chalk.greenBright('successfully')}.`);
            console.log(`New balance: ${chalk.yellow('$')}${chalk.yellowBright(result.newBalance)} (+${chalk.greenBright(amount)})`);
        }
    })
    .set("portfolio", {
        desc: "returns all your portfolio information",
        args: [], callback: async (_args: string[]): Promise<void> => {
            const a = await api_req(
                'portfolio/total',
                'GET'
            );
            const b = await api_req(
                'transactions',
                'GET'
            );
            if (a==undefined || b==undefined) {
                return;
            }
            if (!a.ok) {
                console.log(`${chalk.redBright('API ERROR')}:`);
                console.log(await a.text());
                return;
            }
            if (!b.ok) {
                console.log(`${chalk.redBright('API ERROR')}:`);
                console.log(await b.text());
                return;
            }
            const json = await a.json();
            console.log(`${chalk.bold('Portfolio')}`);
            console.log(`Balance: ${chalk.yellowBright('$')}${chalk.yellow(Math.round(json.baseCurrencyBalance*1000)/1000)}`);
            console.log(`Total coin value: ${chalk.yellowBright('$')}${chalk.yellow(Math.round(json.totalCoinValue*1000)/1000)}`);
            console.log(`Total value: ${chalk.yellowBright('$')}${chalk.yellow(Math.round(json.totalValue*1000)/1000)}`);
            console.log(`Coin holdings`);
            console.log('  Symbol | Quantity Owned | Price | P&L% | 24h Change | Value');
            for (const holding of json.coinHoldings) {
                let percentageChange;
                if (holding.percentageChange > 0) {
                    percentageChange = `${chalk.bgGreen('^ '+holding.percentageChange)}`
                } else if (holding.percentageChange == 0) {
                    percentageChange = `${chalk.bgGray('- '+holding.percentageChange)}`
                } else {
                    percentageChange = `${chalk.bgRedBright('v '+holding.percentageChange)}`
                }
                let dayChange;
                if (holding.change24h > 0) {
                    dayChange = `${chalk.bgGreen('^ '+holding.change24h)}`
                } else if (holding.change24h == 0) {
                    dayChange = `${chalk.bgGray('- '+holding.change24h)}`
                } else {
                    dayChange = `${chalk.bgRedBright('v '+holding.change24h)}`
                }
                console.log(`  ${chalk.bgWhite(holding.symbol)} | ${Math.round(holding.quantity*1000)/1000} | ${chalk.yellow('$')}${chalk.yellowBright(holding.currentPrice)} | ${percentageChange} | ${dayChange} | ${chalk.yellow('$')}${chalk.yellowBright(Math.round(holding.value*1000)/1000)}`);
            }
            console.log('Transactions');
            const trans = await b.json();
            for (const t of trans.transactions) {
                switch (t.type) {
                    case "BUY": {
                        console.log(`  ${chalk.bgGreen('Buy')} ${Math.round(t.quantity*1000)/1000} ${chalk.bgWhite(t.coin.symbol)} for ${chalk.yellow("$")}${chalk.yellowBright(t.totalBaseCurrencyAmount)}`);
                        break;
                    }
                    case "TRANSFER_OUT": {
                        console.log(`  ${chalk.bgBlue('Transferred')} ${t.coin.id == 1 ? `${chalk.yellow('$')}${chalk.yellowBright(Math.round(t.totalBaseCurrencyAmount*1000)/1000)}` : `${Math.round(t.quantity*1000)/1000} ${chalk.bgWhite(t.coin.symbol)}`} to ${chalk.bold(t.recipientUser.username)} `);
                        break;
                    }
                    case "SELL": {
                        console.log(`  ${chalk.bgRedBright('Sell')} ${Math.round(t.quantity*1000)/1000} ${chalk.bgWhite(t.coin.symbol)} for ${chalk.yellow("$")}${chalk.yellowBright(t.totalBaseCurrencyAmount)}`);
                        break;
                    }
                    case "TRANSFER_IN": {
                        console.log(`  ${chalk.bgBlue('Received')} ${t.coin.id == 1 ? `${chalk.yellow('$')}${chalk.yellowBright(Math.round(t.totalBaseCurrencyAmount*1000)/1000)}` : `${Math.round(t.quantity*1000)/1000} ${chalk.bgWhite(t.coin.symbol)}`} from ${chalk.bold(t.senderUser.username)}`);
                    }
                }
            }
        }
    });

console.log(chalk.bold(chalk.yellow("Rugplay")+" API"));
await commands.get("commands")?.callback([]);

while (true) {
    const input_raw = prompt(">");
    if (input_raw == null) {
        break;
    }
    const stream = input_raw.split(" ");
    if (stream.length < 1) {
        continue;
    }
    if (!commands.has(stream[0])) {
        console.log(`${chalk.redBright('Command')} ${chalk.green('"'+stream[0]+'"')} ${chalk.redBright('does not exist')}. Type 'commands' to list commands.`);
        continue;
    }
    await commands.get(stream[0])?.callback(stream.slice(1));
}