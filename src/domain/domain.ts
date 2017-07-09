import { AsyncStorage as AS, Dimensions } from "react-native"
import { Post, Source, Posts, Profile, Attachment, Tag } from "types"

interface PostResponse { posts: Post[], nextPage: number }

module PostsFunctions {

    export const clearNewPostsFromOld = (old: Post[], posts: Post[]): Post[] =>
        old.filter(x => posts.every(i => i.id != x.id))

    export const mergeNextPage = (posts: Post[], webPosts: Post[]): Post[] =>
        posts.concat(webPosts.filter(x => posts.every(i => i.id != x.id)))

    export const mergeNextPage_ = (old: Post[], posts: Post[], webPosts: Post[]): Post[] =>
        old.filter(x => posts.every(i => i.id != x.id) && webPosts.every(i => i.id != x.id))
}

export module Loader {

    export const tags = async (): Promise<Tag[]> =>
        await request<Tag[]>(Domain.tagsReqest("Raizel Knight"))

    interface DiskState { items: Post[] }

    export const preload = async (source: Source): Promise<Posts> => {
        const state: DiskState = JSON.parse(await AS.getItem("state")) || { items: [] }
        return {
            kind: "cache",
            source: source,
            posts: state.items,
        }
    }

    export const next = async (state: Posts): Promise<Posts> => {
        switch (state.kind) {
            case "cache": {
                const web = await request<PostResponse>(Domain.postsUrl(state.source, null))
                return {
                    kind: "cachedAndWeb",
                    state: {
                        source: state.source,
                        posts: state.posts,
                        bufferdPosts: web.posts,
                        next: web.nextPage,
                    }
                }
            }
            case "cachedAndWeb": {
                const old = PostsFunctions.clearNewPostsFromOld(state.state.posts, state.state.bufferdPosts)
                await AS.setItem("state", JSON.stringify({ items: state.state.bufferdPosts.concat(old) }))
                const r: Posts = {
                    kind: "nextPage",
                    state: {
                        source: state.state.source,
                        posts: state.state.bufferdPosts,
                        bufferdPosts: old,
                        next: state.state.next,
                    }
                }
                await AS.setItem("state", JSON.stringify({ items: r.state.posts.concat(r.state.bufferdPosts) }))
                return r
            }
            case "nextPage": {
                const web = await request<PostResponse>(Domain.postsUrl(state.state.source, state.state.next))
                const r: Posts = {
                    kind: "nextPage",
                    state: {
                        source: state.state.source,
                        posts: PostsFunctions.mergeNextPage(state.state.posts, web.posts),
                        bufferdPosts: PostsFunctions.mergeNextPage_(state.state.bufferdPosts, state.state.posts, web.posts),
                        next: web.nextPage,
                    }
                }
                await AS.setItem("state", JSON.stringify({ items: r.state.posts.concat(r.state.bufferdPosts) }))
                return r
            }
        }
        return state
    }

    export const debugReset = () => AS.clear()

    /**
     * 
     */

    export const loadProfile = (name: string): Promise<Profile> =>
        request(Domain.profileUrl(name))

    export const postDescription = (id: number): Promise<Post> =>
        request(Domain.postDetailsUrl(id))

    export function request<T>(api: ParserApi): Promise<T> {
        return fetch(`http://joyreactor.cc${api.path}`)
            .then(x => x.text())
            .then(x => {
                const form = new FormData()
                form.append("html", x)

                const request = {
                    method: "POST",
                    headers: { "Content-Type": "multipart/form-data" },
                    body: form
                }

                return fetch(`http://212.47.229.214:4567/${api.parser}`, request)
            })
            .then(x => x.json())
    }
}

interface ParserApi { readonly path: string, readonly parser: string }

export namespace Domain {

    export const tagsReqest = (user: string): ParserApi =>
        ({ path: `/user/${encodeURIComponent(user)}`, parser: "tags" })
    export const profileUrl = (name: string): ParserApi =>
        ({ path: `/user/${encodeURIComponent(name)}`, parser: "profile" })
    export const postDetailsUrl = (post: number): ParserApi =>
        ({ path: `/post/${post}`, parser: "post" })

    export function postsUrl(tag: Source, page: number | null): ParserApi {
        if (page == null) // TODO: объединить логику
            switch (tag.kind) {
                case "feed": return { path: "/", parser: "posts" }
                case "tags": return { path: `/tag/${encodeURIComponent(tag.name)}`, parser: "posts" }
            }
        switch (tag.kind) {
            case "feed": return { path: `/${page}`, parser: "posts" }
            case "tags": return { path: `/tag/${encodeURIComponent(tag.name)}/${page}`, parser: "posts" }
        }
    }

    export function height(x: Attachment) {
        const w = Dimensions.get("screen").width
        return x ? w / Math.max(1.2, x.aspect) : 0
    }

    export function normalizeUrl(x: Attachment) {
        const prefix = "http://rc.y2k.work/cache/fit?width=300&height=200&bgColor=ffffff&quality=75&url="
        return x ? prefix + encodeURIComponent(x.url) : null
    }
}