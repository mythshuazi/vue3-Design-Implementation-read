// 使用 WeakMap 代替 Set 作为桶的数据结构
// WeakMap 与 Map 的区别有2点：
// 1.WeakMap 只接受对象作为键名（null除外）
// 2.WeakMap 的键名所指向的对象，不计入垃圾回收机制
// https://es6.ruanyifeng.com/#docs/set-map#WeakMap

// 存储副作用函数的桶
const bucket = new WeakMap()

// 用一个全局变量存储被注册的副作用函数
let activeEffect;
const effect = (fn) => {
    // 当调用 effect 注册副作用函数时，将副作用函数 fn 复制给 activeEffect
    activeEffect = fn

    // 执行副作用函数
    fn()
}

// 原始数据
const data = { text: 'hello world' }

const obj = new Proxy(data, {
    // 拦截读取操作
    get (target, key) {
        // 没有 activeEffect，直接 return
        if (!activeEffect) return

        // 根据 target 从“桶”中取得 depsMap，它也是一个 Map 类型：key --> effects
        let depsMap = bucket.get(target)

        // 如果不存在 depsMap，那么新建一个 Map 并与 target 关联
        if (!depsMap) {
            bucket.set(target, (depsMap = new Map()))
        }

        // 再根据 key 从 depsMap 中取得 deps，它是一个 Set 类型
        let deps = depsMap.get(key)

        // 如果 deps 不存在，同样新建一个 Set 并与 key 关联
        if (!deps) {
            depsMap.set(key, (deps = new Set()))
        }

        // 最后将当前激活的副作用函数添加到“桶”里
        deps.add(activeEffect)

        // 返回属性值
        return target[key]
    },

    // 拦截设置操作
    set (target, key, newVal) {
        // 设置属性值
        target[key] = newVal

        const depsMap = bucket.get(target)

        if (!depsMap) return

        const effects = depsMap.get(key)

        effects && effects.forEach(fn => fn())
    }
})

// 注册副作用函数
effect(
    // 匿名副作用函数
    () => {
        console.log('effect run')
        document.body.innerText = obj.text
    }
)

// 1秒后修改响应式数据
setTimeout(() => {
    obj.text = 'hello vue3'
}, 2000)

setTimeout(() => {
    // 副作用函数中并没有读取 notExist 属性的值
    obj.notExist = 'hello vue3'
}, 2000)

/**
 * 疑问：
 * 1. 貌似只有对原始数据进行读取操作的函数才会用effect去注册到bucket中？
 * 比如：
 * effect(() => {
 *  document.body.innerText = '123'
 * })
 * 虽然调用了 effect 去注册，activeEffect 被赋值为此匿名函数，然后执行，
 * 但函数中并无读取 data 的操作，因此就不会运行代理中的 get 方法
 * 
 * 
 * 一句话总结：
 * bucket 是 WeakMap 数据结构，其属性只能为对象，
 * bucket 中的 key 是被代理的对象，比如 data，
 * bucket 中的 val 是 Map 数据结构，
 * 此 Map 数据结构中 key 为 data 的属性名，val 为 set 数据结构用于保存读取data属性的副作用函数
 * 
 * bucket = { // WeakMap
 *   data: { // Map
 *     text: [ // Set
 *       effect1,
 *       effect2,
 *       ...
 *     ]
 *   }
 * }
 */