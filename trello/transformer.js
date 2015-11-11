// Convert from results of Trello API call to a format we can use in InVis

function TrelloTransformer()
{
    this.trelloToken = window.location.search.match(/trelloToken\=(.+)/)[1];
    Trello.setToken(this.trelloToken);

    this.cardArray = [];
    this.cardsByID = {};
    this.dependencyArray = [];

    return this;
};

TrelloTransformer.prototype = function()
{	
    var oldDependsPattern = /\n*DependsOn\((.+)\)/g;
    var dependsOnPattern = /\n*DependsOn\[ *(http|https):\/\/trello.com\/c\/([a-zA-Z0-9_]+) *\]/g;
    var neededForPattern = /\n*NeededFor\[ *(http|https):\/\/trello.com\/c\/([a-zA-Z0-9_]+) *\]/g;


    var buildDependencyOrientatedDataSet = function (cards, lists) {
		
		var getCardState = function(listName){
			if (listName.toLowerCase().indexOf('blocked') === 0) {
				return 'blocked';
			} else if (listName.toLowerCase().indexOf('in progress') === 0) {
				return 'in-progress';
			} else if (listName.toLowerCase().indexOf('backlog') != -1) {
				return 'backlog';
			} else if (listName.toLowerCase().indexOf('done') === 0) {
				return 'done';
			} else if (listName.toLowerCase().indexOf('accepted') === 0) {
				return 'accepted';
			}
			return '';
		};
		
        // enrich cards with list info
		var listsEnum = Enumerable.From(lists[0]);
		var cardsEnum = Enumerable.From(cards[0]);
		
		listsEnum.ForEach(function(list){
			list.nodeType = 'List';
			cardsEnum.Where(function(card){ return card.idList === list.id; }).ForEach(function(card, index){
				card.state = getCardState(list.name);
			});
		});
		
    	// Apply transforms
		this.cardArray = [];
		this.cardsByID = {};
		Enumerable.From(cards[0]).ForEach(function(d){
		    d.nodeType = 'Card';
		    d.dependsOn = [];
		    d.neededFor = [];
		    d.descNeedsUpdate = false;
		    d.nodeIndex = this.cardArray.push(d) - 1;
		    this.cardsByID[d.shortLink] = d;
		}.bind(this));
		
        // Build links. We build them in both directions, whether
        // we see NeededFor or DependsOn, and merge the duplicates.
		this.dependencyArray = [];
		Enumerable.From(this.cardArray).ForEach(function (node, i) {
		    var match = null;
		    while (match = oldDependsPattern.exec(node.desc)) {
		        addLink.bind(this)(node.shortLink, match[1], false, false);
		    }
		    while (match = dependsOnPattern.exec(node.desc)) {
		        addLink.bind(this)(node.shortLink, match[2], true, false);
		    }
		    while (match = neededForPattern.exec(node.desc)) {
		        addLink.bind(this)(match[2], node.shortLink, false, true);
		    }
		}.bind(this));

        // If any dependencies were only on one of the cards, we
        // mark the other one as needing an update.
		Enumerable.From(this.dependencyArray).ForEach(function (link, i) {
		    if (!link.seenInTarget) {
		        link.target.descNeedsUpdate = true;
		    }
		    if (!link.seenInSource) {
		        link.source.descNeedsUpdate = true;
		    }
		}.bind(this));

        // Push up any that need changing. We do this directly instead of syncing,
        // because we generated this with data we just got from Trello.
		Enumerable.From(this.cardArray).ForEach(function (node, i) {
		    if (node.descNeedsUpdate) {
		        pushDescriptionWithDependencies(node);
		    }
		}.bind(this));

		return { nodes: this.cardArray, edges: this.dependencyArray };
	};


    var addLink = function (targetID, sourceID, seenInTarget, seenInSource) {
        var targetNode = this.cardsByID[targetID];
        var sourceNode = this.cardsByID[sourceID];
        if (typeof targetNode === "undefined" || typeof sourceNode === "undefined") {
            if (targetNode && seenInTarget) {
                targetNode.descNeedsUpdate = true;
            }
            if (sourceNode && seenInSource) {
                sourceNode.descNeedsUpdate = true;
            }
            return;
        }
        var targetLink = Enumerable.From(targetNode.dependsOn).SingleOrDefault(null, function (d) {
            return d.source === sourceNode;
        });
        var sourceLink = Enumerable.From(sourceNode.neededFor).SingleOrDefault(null, function (d) {
            return d.target === targetNode;
        });
        var link = targetLink ? targetLink : sourceLink;
        if (!link) {
            link = {
                target: targetNode,
                source: sourceNode,
                seenInTarget: seenInTarget,
                seenInSource: seenInSource
            };
        } else {
            link.seenInSource = link.seenInSource || seenInSource;
            link.seenInTarget = link.seenInTarget || seenInTarget;
        }

        if (link !== targetLink) {
            targetNode.dependsOn.push(link);
            if (targetLink) {
                targetNode.descNeedsUpdate = true;
            }
        }
        if (link !== sourceLink) {
            sourceNode.neededFor.push(link);
            if (sourceLink) {
                sourceNode.descNeedsUpdate = true;
            }
        }
        this.dependencyArray.push(link);
    };


	var pushDescriptionWithDependencies = function (node) {
	    var oldDesc = node.desc;
	    var newDesc = oldDesc
            .replace(oldDependsPattern, '')
            .replace(dependsOnPattern, '')
            .replace(neededForPattern, '');

	    if (node.dependsOn && node.dependsOn.length > 0) {
	        if (newDesc.length > 0) {
	            if (newDesc.charAt(newDesc.length - 1) != '\n') {
	                newDesc += '\n\n';
	            } else if (newDesc.length > 1 && newDesc.charAt(newDesc.length - 2) != '\n') {
	                newDesc += '\n';
	            }
	        }
	        Enumerable.From(node.dependsOn).ForEach(function (link) {
	            if (newDesc.length > 0 && newDesc.charAt(newDesc.length-1) != '\n') newDesc += '\n';
	            newDesc += 'DependsOn[ https://trello.com/c/' + link.source.shortLink + ' ]';
	        });
	    }
	    if (node.neededFor && node.neededFor.length > 0) {
	        if (newDesc.length > 0) {
	            if (newDesc.charAt(newDesc.length - 1) != '\n') {
	                newDesc += '\n\n';
	            } else if (newDesc.length > 1 && newDesc.charAt(newDesc.length - 2) != '\n') {
	                newDesc += '\n';
	            }
	        }
	        Enumerable.From(node.neededFor).ForEach(function (link) {
	            if (newDesc.length > 0 && newDesc.charAt(newDesc.length - 1) != '\n') newDesc += '\n';
	            newDesc += 'NeededFor[ https://trello.com/c/' + link.target.shortLink + ' ]';
	        });
	    }

	    node.descNeedsUpdate = false;
	    if (newDesc != oldDesc) {
	        Trello.setToken(this.trelloToken);
	        Trello.put('cards/' + node.shortLink + '/desc',
                       { value: newDesc },
                       function (res) { console.log(res); });
	    }
	};


	var updateDescriptionWithDependencies = function (node) {
	    Trello.setToken(this.trelloToken);
	    Trello.cards.get(node.shortLink).promise().done(function (r) {
	        node.desc = r.desc;
	        pushDescriptionWithDependencies.bind(this)(node);
	    }.bind(this));
	}


	var updateAllDirtyDescriptions = function () {
	    Enumerable.From(this.cardArray).ForEach(function (node, i) {
	        if (node.descNeedsUpdate) {
	            updateDescriptionWithDependencies.bind(this)(node);
	        }
	    }.bind(this));
	};


	var buildListOrientatedDataSet = function(cards,lists){
			
	    var listsEnum = Enumerable.From( lists[0]);
	    listsEnum.ForEach(function(d){d.nodeType = 'List'});
				
	    var cardsEnum = Enumerable.From( cards[0]);
	    cardsEnum.ForEach(function(d){d.nodeType = 'Card'});
			
	    var nodes = listsEnum.Union(cardsEnum).ToArray();
			
	    // The index is important here
	    var getListId = function(card){
				
		    if(card.nodeType == 'List') {return -1;}
					
		    var matchingList = Enumerable.From(nodes).Single(function(d){ return d.nodeType == 'List' && d.id === card.idList});
		    return listsEnum.IndexOf(matchingList);
	    };
				
	    var edges = Enumerable.From(nodes).Select(function(d,i){ 
	    return {source : i, 
			    target : getListId(d) }
	    }).Where(function(d){return d.target != -1;}).ToArray();
				
	    var centralNodeIndex = nodes.push({name:'Lists', nodeType : 'Anchor'}) - 1;
				
	    edges = Enumerable.From(edges).Union(Enumerable.From(nodes)
				    .Select(function(d,i){return {source :centralNodeIndex, target : i, targetNodeType : d.nodeType }})
				    .Where(function(d){return d.targetNodeType == 'List'})).ToArray();
				
	    return {nodes:nodes, edges: edges};			
	};


	var removeDependency = function (c1, c2) {
	    if (typeof c1 === 'string') {
	        c1 = this.cardsByID[c1];
	    }

	    if (typeof c2 === 'string') {
	        c2 = this.cardsByID[c2];
	    }

	    var allRemoved = [];
	    if (c1 && c2) {
	        var remove = function (c, arr) {
	            for (var i = arr.length; i--;) {
	                var link = arr[i];
	                if ((link.source === c1 && link.target === c2) ||
                        (link.source === c2 && link.target === c1)) {
	                    c.descNeedsUpdate = true;
	                    arr.splice(i, 1);
	                    if (allRemoved.indexOf(link) < 0) {
	                        allRemoved.push(link);
	                    }
	                }
	            }
	        }
	        remove(c1, c1.dependsOn);
	        remove(c1, c1.neededFor);
	        remove(c2, c2.dependsOn);
	        remove(c2, c2.neededFor);
	        for (var i = allRemoved.length; i--;) {
	            var link = allRemoved[i];
	            var index = this.dependencyArray.indexOf(link);
	            if (index >= 0) {
	                this.dependencyArray.splice(index, 1);
	            }
	        }
	    }

	    // Caller is responsible for calling updateAllDirtyDescriptions()

	    return allRemoved;
	}

	var addDependency = function (source, target) {
	    if (typeof source === 'string') {
	        source = this.cardsByID[source];
	    }

	    if (typeof target === 'string') {
	        target = this.cardsByID[target];
	    }

	    if (source && target) {
	        var existing = null;
	        var checkExisting = function(arr) {
	            for (var i = arr.length; i--;) {
	                var link = arr[i];
	                if (link.source !== source || link.target !== target) continue;
	                if (!existing) {
	                    existing = link;
	                    var j = source.neededFor.indexOf(link);
	                    if (j < 0) {
	                        source.neededFor.push(link);
	                        source.descNeedsUpdate = true;
	                    }
	                    j = target.dependsOn.indexOf(link);
	                    if (j < 0) {
	                        target.dependsOn.push(link);
	                        target.descNeedsUpdate = true;
	                    }
	                } else {
	                    var j = source.neededFor.indexOf(link);
	                    if (j >= 0) {
	                        source.neededFor.splice(j, 1);
	                        source.descNeedsUpdate = true;
	                    }
	                    j = target.dependsOn.indexOf(link);
	                    if (j >= 0) {
	                        target.dependsOn.splice(j, 1);
	                        target.descNeedsUpdate = true;
	                    }
	                    j = this.dependencyArray.indexOf(link);
	                    if (j >= 0) {
	                        this.dependencyArray.splice(j, 1);
	                    }
	                }
	            }
	        };

	        checkExisting(source.neededFor);
	        checkExisting(target.dependsOn);

	        if (existing) {
	            return existing;
	        }

	        var newLink = {
                source: source,
                seenInSource: false,
                target: target,
                seenInTarget: false
	        };

	        source.neededFor.push(newLink);
	        source.descNeedsUpdate = true;

	        target.dependsOn.push(newLink);
	        target.descNeedsUpdate = true;

	        this.dependencyArray.push(newLink);

	        return newLink;
        }
	}
			
	return {
		buildListOrientatedDataSet: buildListOrientatedDataSet,
		buildDependencyOrientatedDataSet: buildDependencyOrientatedDataSet,
		updateAllDirtyDescriptions: updateAllDirtyDescriptions,
        addDependency: addDependency,
        removeDependency: removeDependency
	};
}();