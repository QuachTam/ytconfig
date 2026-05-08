(function() {
    const Parser = {
        findVideos: function(obj) {
            let found = [];
            if (!obj || typeof obj !== 'object') return found;
            
            const watchId = (obj.navigationEndpoint && obj.navigationEndpoint.watchEndpoint && obj.navigationEndpoint.watchEndpoint.videoId) ||
                            (obj.title && obj.title.runs && obj.title.runs[0] && obj.title.runs[0].navigationEndpoint && obj.title.runs[0].navigationEndpoint.watchEndpoint && obj.title.runs[0].navigationEndpoint.watchEndpoint.videoId) ||
                            (obj.flexColumns && obj.flexColumns[0] && obj.flexColumns[0].musicResponsiveListItemFlexColumnRenderer && obj.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text && obj.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text.runs && obj.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text.runs[0] && obj.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text.runs[0].navigationEndpoint && obj.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text.runs[0].navigationEndpoint.watchEndpoint && obj.flexColumns[0].musicResponsiveListItemFlexColumnRenderer.text.runs[0].navigationEndpoint.watchEndpoint.videoId);
            
            let thumbId = "";
            const thumbUrl = (obj.thumbnail && obj.thumbnail.thumbnails && obj.thumbnail.thumbnails[0]?.url) || (obj.thumbnail && obj.thumbnail.url);
            if (thumbUrl && typeof thumbUrl === 'string') {
                const match = thumbUrl.match(/\\/vi\\/([^\\/]+)\\/|vi_webp\\/([^\\/]+)\\/|vi=([^&]+)/);
                if (match) thumbId = match[1] || match[2] || match[3];
            }

            let vId = watchId || thumbId || obj.videoId || (obj.playlistItemData && obj.playlistItemData.videoId);
            
            if (vId && typeof vId === 'string') {
                if (vId.includes(':') && thumbId && !thumbId.includes(':')) vId = thumbId;
                if (vId.includes(':')) vId = vId.split(':').pop();

                let title = obj.name || (obj.title && (obj.title.simpleText || (obj.title.runs && obj.title.runs[0]?.text) || (typeof obj.title === 'string' ? obj.title : ""))) || (obj.accessibility && obj.accessibility.accessibilityData && obj.accessibility.accessibilityData.label);
                
                if (vId.length === 11 && title) {
                    const thumb = (obj.thumbnail && obj.thumbnail.url) || (obj.thumbnail && obj.thumbnail.thumbnails && obj.thumbnail.thumbnails[0]?.url) || `https://i.ytimg.com/vi/${vId}/hqdefault.jpg`;
                    let artists = [];
                    if (obj.artists && Array.isArray(obj.artists)) {
                        artists = obj.artists.map(a => a.name || a.text || "");
                    } else if (obj.subtitle && obj.subtitle.runs) {
                        artists = obj.subtitle.runs.map(r => r.text);
                    } else if (obj.shortBylineText && obj.shortBylineText.runs) {
                        artists = obj.shortBylineText.runs.map(r => r.text);
                    }
                    
                    found.push({ 
                        videoId: vId, 
                        title: title, 
                        channelTitle: artists.join(", ") || "YouTube", 
                        thumbnailUrl: thumb,
                        viewCount: "",
                        artists: artists
                    });
                }
            }
            
            for (let key in obj) {
                if (obj.hasOwnProperty(key) && typeof obj[key] === 'object' && obj[key] !== null) {
                    if (key === 'trackingParams' || key === 'commandMetadata') continue;
                    found.push(...Parser.findVideos(obj[key]));
                }
            }
            return found;
        },
        
        scrapeDOM: function() {
            const videos = [];
            const rows = document.querySelectorAll('ytmc-entry-row, .ytmc-entry-row, .chart-row, tr.chart-table-row');
            rows.forEach(row => {
                try {
                    const titleEl = row.querySelector('.title, #title, .ytmc-entry-row-title, .chart-table-row-title');
                    const artistEl = row.querySelector('.artist, #artist, .ytmc-entry-row-artist, .chart-table-row-artist');
                    const thumbEl = row.querySelector('img');
                    const linkEl = row.querySelector('a[href*="watch?v="]');
                    
                    let videoId = "";
                    if (linkEl) {
                        const url = new URL(linkEl.href);
                        videoId = url.searchParams.get('v');
                    } else if (thumbEl && thumbEl.src) {
                        const match = thumbEl.src.match(/\\/vi\\/([^\\/]+)\\/|vi=([^&]+)/);
                        if (match) videoId = match[1] || match[2];
                    }
                    
                    if (videoId && titleEl) {
                        videos.push({
                            videoId: videoId,
                            title: titleEl.innerText.trim(),
                            channelTitle: artistEl ? artistEl.innerText.trim() : "YouTube",
                            thumbnailUrl: thumbEl ? thumbEl.src : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                            viewCount: "",
                            artists: [artistEl ? artistEl.innerText.trim() : "YouTube"]
                        });
                    }
                } catch(e) {}
            });
            return videos;
        }
    };

    const send = (t, d) => {
        if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.chartsHandler) {
            window.webkit.messageHandlers.chartsHandler.postMessage({type: t, data: d});
        }
    };

    send('HEALTH_CHECK', { status: 'running', version: 'local_v3', url: window.location.href });

    const scan = () => {
        const wizData = window.WIZ_global_data || window._yt_player || window.ytInitialData || window.ytChartsInitialData;
        if (wizData) {
            const vids = Parser.findVideos(wizData);
            if (vids.length > 0) {
                send('API_DATA', vids);
                return;
            }
        }
        const domVids = Parser.scrapeDOM();
        if (domVids.length > 0) {
            send('API_DATA', domVids);
        }
    };
    
    setTimeout(scan, 2000);
    setTimeout(scan, 5000);
    setTimeout(scan, 10000);

    const oldXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function() {
        this.addEventListener('load', function() {
            if (this.responseURL.includes('/v1/')) {
                try {
                    const videos = Parser.findVideos(JSON.parse(this.responseText));
                    if (videos.length > 0) send('API_DATA', videos);
                } catch(e) {}
            }
        });
        return oldXHR.apply(this, arguments);
    };
})();
