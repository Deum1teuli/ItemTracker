module.exports = function (grunt) {

    grunt.initConfig({
        clean: ['collectibles64', 'items_ru.json', 'collectibles32.css', 'collectibles32.png', 'collectibles64.css', 'collectibles64.png'],
        responsive_images: {
            all: {
                options: {
                    sizes: [{
                        width: 64,
                        filter: 'Point',
                        upscale: true
                    }]
                },
                files: [{
                    expand: true,
                    src: ['*.png'],
                    cwd: 'collectibles/',
                    dest: 'collectibles64/'
                }]
            }
        },
        sprite: {
            32: {
                src: 'collectibles/*.png',
                dest: 'collectibles32.png',
                destCss: 'collectibles32.css'
            },
            64: {
                src: 'collectibles64/*.png',
                dest: 'collectibles64.png',
                destCss: 'collectibles64.css'
            }
        }
    });

    grunt.loadNpmTasks('grunt-contrib-clean');
    grunt.loadNpmTasks('grunt-responsive-images');
    grunt.loadNpmTasks('grunt-spritesmith');
    
    grunt.registerTask('default', ['clean', 'updateItems', 'responsive_images', 'sprite']);

    grunt.registerTask('updateItems', 'Update Item Descriptions.', function (lang) {
        var done = this.async();
        var langs = {
            ru: function (itemsRes) {
                var replaces = {
                        'E Coli': 'E. Coli',
                        'Bob\'s Curse': 'Bobs Curse',
                        '1UP': '1up!',
                        'Distant Admiraton': 'Distant Admiration',
                        'Technology 1': 'Technology',
                        'Mini Mushroom': 'Mini Mush',
                        'A Quater': 'A Quarter',
                        'Dead Cat\n(Guppy)': 'Dead Cat',
                        'Spider\'s Bite': 'Spider Bite',
                        'Little Steve': 'Little Steven',
                        'D6': 'The D6',
                        'The Pony': 'A Pony',
                        'Sacrificial Knife': 'Sacrificial Dagger',
                        'Toothpicks': 'Tooth Picks',
                        'Guppy\'s Hair Ball': 'Guppy\'s Hairball',
                        'SMB Super Fan!': 'SMB Super Fan',
                        'Meat': 'MEAT!',
                        'Humble Bundle': 'Humbleing Bundle',
                        'Spider Baby': 'Spiderbaby',
                        'A Missing Page 2': 'Missing Page 2',
                        'Robo Baby 2.0': 'Robo-Baby 2.0',
                        'Lil Haunt': 'Lil\' Haunt',
                        'Strange Attractior': 'Strange Attractor'
                    },
                    replaceIds = {
                        120: 'Odd Mushroom (Thin)',
                        121: 'Odd Mushroom (Large)'
                    },
                    ignoreIds = ['43', '61'];

                function parseItem($tr) {
                    var $tds = $tr.find('td'),
                        item = {};
                    item.name = $($tds.get(1)).text().trim();
                    if (replaces[item.name]) {
                        item.name = replaces[item.name];
                    }
                    item.regexp = new RegExp('^' + item.name.replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&") + '$', 'i');
                    item.localName = $($tds.get(0)).text().trim();
                    //                    item.img = $($tds.get(2)).find('a').attr('href');
                    item.localDescription = $($tds.get(3)).text().trim();
                    return item;
                }

                return new Promise(function (resolve, reject) {
                    request('http://ru.bindingofisaac.wikia.com/wiki/%D0%9F%D1%80%D0%B5%D0%B4%D0%BC%D0%B5%D1%82%D1%8B_The_Binding_of_Isaac:_Rebirth', function (error, response, body) {
                        if (!error && response.statusCode == 200) {
                            var $ = cheerio.load(body),
                                items = [],
                                resultItems = [];
                            var activesTable = $('h2 > span:contains("Активируемые артефакты ")').parent().next('table');
                            $(activesTable).find('tr').slice(1).each(function () {
                                var item = parseItem($(this));
                                item.active = true;
                                items.push(item);
                            });
                            var passiveTable = $('h2 > span:contains("Пассивные артефакты")').parent().next('table');
                            $(passiveTable).find('tr').slice(1).each(function () {
                                var item = parseItem($(this));
                                item.active = false;
                                items.push(item);
                            });
                            grunt.log.ok('(Russian) Downloaded ' + items.length + ' items');
                            itemsRes.forEach(function (item) {
                                if (ignoreIds.indexOf(item.attribs['id']) >= 0) {
                                    return;
                                }
                                var itemRes;
                                for (var i = 0; i < items.length; i++) {
                                    var tmpItem = items[i];
                                    if (!tmpItem) {
                                        break;
                                    }
                                    if ((replaceIds[item.attribs['id']] ? replaceIds[item.attribs['id']] : item.attribs['name']).match(tmpItem.regexp)) {
                                        itemRes = {
                                            id: item.attribs['id'],
                                            name: item.attribs['name'],
                                            localName: tmpItem.localName,
                                            type: item['name'],
                                            gfx: item.attribs['gfx'].toLowerCase().slice(0, -4),
                                            localDescription: tmpItem.localDescription
                                        };
                                        resultItems.push(itemRes);
                                        //delete items[i];
                                        break;
                                    }
                                }
                                if (!itemRes) {
                                    grunt.log.error('(Russian) ' + item.attribs['id'] + ':' + item.attribs['name'] + ' Not found');
                                }
                            });
                            grunt.log.ok('(Russian) Items found: ' + resultItems.length + ' / ' + itemsRes.length + '(-' + ignoreIds.length + ')');
                            fs.writeFile('items_ru.json', JSON.stringify(resultItems), function (err) {
                                if (error) {
                                    reject(error);
                                } else {
                                    grunt.log.ok('(Russian) Saved in items_ru.json');
                                    resolve(resultItems);
                                }
                            });
                        } else {
                            reject(error);
                        }
                    });
                });
            }
        };
        if (lang && !langs[lang]) {
            done(False);
            return;
        }
        var request = require('request'),
            cheerio = require('cheerio'),
            fs = require('fs'),
            Promise = require('promise'),
            $ = cheerio.load(fs.readFileSync('items.xml'), {
                xmlMode: true
            });
        var items = $('items > *:not(trinket)').toArray();
        if (lang) {
            langs[lang](items).then(done, function () {
                done(false);
            });
        } else {
            var promises = [];
            for (var k in langs) {
                promises.push(langs[k](items));
            }
            Promise.all(promises).then(done, function () {
                done(false);
            });
        }
    });

};