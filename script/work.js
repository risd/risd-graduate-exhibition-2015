var fs = require('fs');

var cors = require('corslite');
var request = require('request');
var from = require('from2');
var through = require('through2');

var hyperglue = require('hyperglue');
var Packery = require('packery');
var template = fs.readFileSync(__dirname + '/piece.html')
                 .toString();


module.exports = Work;

function Work (selector) {
    if (!(this instanceof Work)) return new Work(selector);
    if (!selector) throw new Error('Requires selector.');
    var self = this;

    this.container = document.querySelector(selector);
    this.packery = new Packery(this.container, {
            itemSelector: '.piece',
            gutter: 10
        });

    this.s3 = 'https://risdgradshow2015.s3.amazonaws.com/';
    this.link = {
        meta: this.s3 + 'data/metadata.json',
        project: function (id) {
            return [
                    self.s3,
                    'projects/',
                    id,
                    '.json'
                ]
                .join('');
        }
    };
    this.requested = [];
    this.pages = [];
    this.included_departments = [];
    this.projects = [];
}

Work.prototype.get = function() {
    var self = this;
    var eventStream = through.obj();

    from.obj([self.link.meta])
        .pipe(GetMetadata())
        .pipe(GetProjects())
        .pipe(Render());

    return eventStream;

    function GetMetadata () {
        return through.obj(meta);

        function meta (url, enc, next) {
            console.log('GetMetadata');
            var stream = this;
            if (self.pages.length > 0) {
                feed();
            } else {
                cors(url, function (err, res) {
                    if (!err && res.status === 200) {
                        var body =
                            JSON.parse(res.responseText);

                        self.included_departments =
                            body.included_departments;
                        self.pages = body.pages;
                    } else {
                        console.log(err);
                        console.log(res.status);
                    }
                    feed();
                });
            }

            function feed () {
                shuffle(self.pages)
                    .forEach(function (page) {
                        stream.push(page);
                    });
                stream.push(null);
                next();
            }
        }
    }

    function GetProjects () {
        return through.obj(projects);

        function projects (projectURL, enc, next) {
            console.log('GetProjects');
            var stream = this;
            cors(projectURL, function (err, res) {
                var body = { objects: [] };
                if (!err && res.status === 200) {
                    body =
                        JSON.parse(res.responseText);
                    self.projects.concat(body.objects);
                } else {
                    console.log(err);
                    console.log(res.status);
                }
                shuffle(body.objects)
                    .forEach(function (project) {
                        stream.push(project);
                    });
                next();
            });
        }
    }

    function Transform () {
        return through.obj(trnsfrm);

        function trnsfrm (project, enc, next) {
            var modules_for_cover = [];
            var modules_to_include = [];
            project.details.modules.forEach(function (md, mi) {
                if (md.type === 'image') {
                    modules_for_cover.push(md);
                }
                // these are all cases that are
                // covered in lightbox.js
                if ((md.type === 'image') |
                    (md.type === 'text') |
                    (md.type === 'embed') |
                    (md.type === 'video')) {

                    modules_to_include.push(md);
                }
            });

            var random_cover;
            if (modules_for_cover.length > 0) {
                // random_cover_option
                // based on images to include
                var random_module =
                    modules_for_cover[Math.floor(Math.random() *
                                       modules_for_cover.length)];

                random_cover = {
                    original_width: +random_module.width,
                    original_height: +random_module.height,
                    src: random_module.src
                };
                random_cover.height = (random_cover.width*
                                       random_module.height)/
                                      random_module.width;
            } else {
                // otherwise, just use a the cover that
                // is included
                random_cover = {
                    original_width: 404,
                    original_height: 316,
                    src: project.details.covers['404']
                };
            }

            var formatted = {
                project_name: project.name,
                student_name: project.owners[0].display_name,
                risd_program: project.risd_program,
                risd_program_class:
                    escape_department(project.risd_program),
                modules: modules_to_include,
                cover: random_cover,
                description: project.details.description,
                url: project.owners[0].url,
                personal_link: project.personal_link,
                id: project.id
            };

            this.push(formatted);
            next();
        }
    }

    function Render () {
        return through.obj(rndr);

        function rndr (project, enc, next) {
            var toRender = hyperglue(template, {
                    '[class=student-name]': project.owners[0].display_name,
                    '[class=risd-program]': project.risd_program
                });
            self.container.appendChild(toRender);
            self.packery.appended(toRender);
            self.packery.layout();
            next();
        }
    }
};

function projectKey (project) {
    return project.id;
}

function shuffle (o) {
    for(var j, x, i = o.length;
        i;
        j = Math.floor(Math.random() * i),
        x = o[--i], o[i] = o[j], o[j] = x);
    return o;
}