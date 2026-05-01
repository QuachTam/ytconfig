(function() {
    /**
     * SERVER-DRIVEN SCRAPER CORE (V1.2)
     */
    const Parser = {
        findVideos: function(obj) {
            let found = [];
            if (!obj || typeof obj !== 'object') return found;
            
            // Nhận diện ID
            const vId = obj.id || obj.videoId || obj.browseId || (obj.playlistItemData && obj.playlistItemData.videoId);
            
            // Nhận diện Title
            let title = obj.name || "";
            if (!title && obj.title) {
                title = obj.title.simpleText || (obj.title.runs && obj.title.runs[0]?.text) || (typeof obj.title === 'string' ? obj.title : "");
            }

            if (vId && title && typeof vId === 'string' && vId.length > 2) {
                const thumb = (obj.thumbnail && obj.thumbnail.url) || 
                              (obj.thumbnail && obj.thumbnail.thumbnails && obj.thumbnail.thumbnails[0]?.url) || 
                              `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`;
                
                // Bóc tách Artist (Hung hãn hơn)
                let artists = [];
                if (obj.artists && Array.isArray(obj.artists) && obj.artists.length > 0) {
                    artists = obj.artists.map(a => a.name || a.text || "");
                } else if (obj.subtitle && obj.subtitle.runs) {
                    artists = obj.subtitle.runs.map(r => r.text);
                } else if (obj.artistNames) {
                    artists = [obj.artistNames];
                }
                
                // Bóc tách ViewCount (Quét nhiều trường)
                let views = "";
                const vText = obj.viewCountText || obj.shortViewCountText || obj.viewCount;
                if (vText) {
                    views = vText.simpleText || (vText.runs && vText.runs[0]?.text) || (typeof vText === 'string' ? vText : "");
                }

                found.push({
                    videoId: vId,
                    title: title,
                    channelTitle: artists.join(", ") || "YouTube",
                    thumbnailUrl: thumb,
                    viewCount: views,
                    artists: artists,
                    source: "REMOTE_JS"
                });
            }

            for (let key in obj) {
                if (obj.hasOwnProperty(key) && typeof obj[key] === 'object' && obj[key] !== null) {
                    found.push(...this.findVideos(obj[key]));
                }
            }
            return found;
        }
    };

    function sendToSwift(type, data) {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.chartsHandler) {
            window.webkit.messageHandlers.chartsHandler.postMessage({type: type, data: data});
        }
    }

    // 1. Đánh chặn XHR
    const oldXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function() {
        this.addEventListener('load', function() {
            if (this.responseURL.includes('v1/browse')) {
                try {
                    const videos = Parser.findVideos(JSON.parse(this.responseText));
                    if (videos.length > 0) sendToSwift('API_DATA', videos);
                } catch(e) {}
            }
        });
        return oldXHR.apply(this, arguments);
    };

    // 2. Đánh chặn Fetch (Hỗ trợ cả Request object)
    const oldFetch = window.fetch;
    window.fetch = async (...args) => {
        const url = (args[0] instanceof Request) ? args[0].url : args[0];
        const response = await oldFetch(...args);
        
        if (url && url.includes('v1/browse')) {
            const clone = response.clone();
            clone.json().then(json => {
                const videos = Parser.findVideos(json);
                if (videos.length > 0) sendToSwift('API_DATA', videos);
            }).catch(() => {});
        }
        return response;
    };

    // 3. Health Check
    sendToSwift('HEALTH_CHECK', { status: 'active', url: window.location.href });
    console.log("🚀 Remote Scraper v1.2 Initialized");
})();
