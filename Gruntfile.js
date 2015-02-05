module.exports = function (grunt) {

    grunt.registerTask('updateItems', 'Update Item Descriptions.', function (lang) {
        var done = this.async();
        var langs = {
            ru: function (items) {
                var replaces = {'E Coli': 'E. Coli', 'Bob\'s Curse': 'Bobs Curse'};
                
                function parseItem($tr) {
                    var $tds = $tr.find('td'),
                        item = {};
                    item.name = $($tds.get(1)).text().trim();
                    if (replaces[item.name]) {
                        item.name = replaces[item.name];
                    }
                    //item.regexp = new RegExp('^' + item.name.replace(/[.?*+^$[\]\\(){}|-]/g, "\\$&") + '$', 'i');
                    item.localName = $($tds.get(0)).text().trim();
                    item.img = $($tds.get(2)).find('a').attr('href');
                    item.localDescription = $($tds.get(3)).text().trim();
                    return item;
                }

                return new Promise(function (resolve, reject) {
                    request('http://ru.bindingofisaac.wikia.com/wiki/%D0%9F%D1%80%D0%B5%D0%B4%D0%BC%D0%B5%D1%82%D1%8B_The_Binding_of_Isaac:_Rebirth', function (error, response, body) {
                        if (!error && response.statusCode == 200) {
                            var $ = cheerio.load(body),
                                items = [];
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
                            console.log(items.length);
                            resolve(items);
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
            langs[lang](items);
        } else {
            for (var k in langs) {
                langs[k](items);
            }
        }
        //grunt.log.writeln(this.target + ': ' + this.data);
    });

};