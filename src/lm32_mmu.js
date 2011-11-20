/**
 * Basic MMU.
 *
 * Copyright (c) 2011 Reginaldo Silva (reginaldo@ubercomp.com)
 * Created: 10/09/11 18:10
 * 
 */
"use strict";
/**
 * MMU
 * read functions return undefined when cannot read
 * write functions return true when write is possible, false otherwise
 */
lm32.MMU = function() {
    this.handlers = [];
    this.last_handler = undefined;
};

lm32.MMU.prototype.get_handler_for = function(addr, name) {
    var handler = undefined;
    if(this.last_handler
        && (addr >= this.last_handler.base_addr)
        && (addr < this.last_handler.base_addr + this.last_handler.size)) {
        return this.last_handler;
    }
    var len = this.handlers.length;
    for(var i = 0; i < len; i++) {
        var curr = this.handlers[i];
        if((addr >= curr.base_addr) && (addr < curr.base_addr + curr.size)) {
            handler = curr;
            this.last_handler = handler;
        }
    }
    if(!handler) {
        lm32.util.trace("MMU get_handler_for (called by " + name + "): no handler found for address 0x" + addr.toString(16));
    }
    return handler;
};

lm32.MMU.prototype.add_memory = function(base, size, funcs) {
    if( (base < 0) || (size < 1) || ((base + size) > 0xffffffff) ) {
        throw ("ERROR: Invalid base and size parameters")
    }
    var len = this.handlers.length;
    for(var i = 0; i < len; i++) {
        var curr = this.handlers[i];
        if(lm32.util.overlaps(base, base + size - 1, curr.base_addr, curr.base_addr + curr.size - 1)) {
            var ctext = "(base_addr = " + curr.base_addr.toString(16) + ", size = " + curr.size.toString(16) + ")";
            var ttext = "(base_addr = " + base.toString(16) + ", size = " + size.toString(16) + ")";
            throw("ERROR: Bank at " + ttext + " overlaps with " + ctext + ".");
        }
    }

    var h = {};
    h.base_addr = base;
    h.size = size;
    if(funcs.read_8)   { h.read_8   = funcs.read_8;   };
    if(funcs.read_16)  { h.read_16  = funcs.read_16;  };
    if(funcs.read_32)  { h.read_32  = funcs.read_32;  };
    if(funcs.write_8)  { h.write_8  = funcs.write_8;  };
    if(funcs.write_16) { h.write_16 = funcs.write_16; };
    if(funcs.write_32) { h.write_32 = funcs.write_32; };
    this.handlers.push(h);
    lm32.util.trace("Adding handlers at address 0x", base.toString(16), " with size", size, "->", h, "n = ", this.handlers.length);

};

lm32.MMU.prototype.read = function(addr, mask, name) {
    if(addr > 0x0bffe000 && addr <= (0x0bffe000 + 4096)) {
        console.log("hwsetup");
    }
    var handler = this.get_handler_for(addr, name);
    if(handler && (name in handler)) {
        var offset = addr - handler.base_addr;
        return (((handler[name])(offset)) & mask);
    } else {
        lm32.util.error_report("MMU: Cannot " + name + " at address: 0x" + lm32.bits.unsigned32(addr.toString(16)));
    }
}

lm32.MMU.prototype.read_8 = function(addr) {
    return this.read(addr, 0xff, "read_8");
};

lm32.MMU.prototype.read_16 = function(addr) {
    return this.read(addr, 0xffff, "read_16");
};

lm32.MMU.prototype.read_32 = function(addr) {
    return this.read(addr, 0xffffffff, "read_32");
};

lm32.MMU.prototype.write = function(addr, val, mask, name) {
    var handler = this.get_handler_for(addr, name);
    var ret = true;
    if(handler && (name in handler)) {
        var offset = addr - handler.base_addr;
        var sval = val & mask; //safe
        try {
            (handler[name])(offset, sval);
        } catch(err) {
            ret = false;
            lm32.util.error_report("MMU: Cannot " + name + " value 0x" + sval  +  " at address: 0x" + lm32.bits.unsigned32(addr.toString(16)));
        }
    } else {
        ret = false;
    }
    return ret;
}

lm32.MMU.prototype.write_8 = function(addr, val) {
    return this.write(addr, val, 0xff, "write_8");
};

lm32.MMU.prototype.write_16 = function(addr, val) {
    return this.write(addr, val, 0xffff, "write_16");
};

lm32.MMU.prototype.write_32 = function(addr, val) {
    return this.write(addr, val, 0xffffffff, "write_32");
};

lm32.MMU.prototype.copy_region = function(from, to, size) {
    if(size <= 0) {
        return;
    }
    for(var i = 0; i < size; i++) {
        this.write_8(to + i, this.read_8(from + i));
    }
};

lm32.MMU.prototype.load_binary = function (file, addr) {
    var req, response, size, i, buff, has_typed_arrays;
    if (typeof ActiveXObject == "function") return this.load_binary_ie9(file, addr);
    req = new XMLHttpRequest();
    req.open('GET', file, false);
    has_typed_arrays = ('ArrayBuffer' in window && 'Uint8Array' in window);
    if (has_typed_arrays && 'mozResponseType' in req) {
        req.mozResponseType = 'arraybuffer';
    } else if (has_typed_arrays && 'responseType' in req) {
        req.responseType = 'arraybuffer';
    } else {
        req.overrideMimeType('text/plain; charset=x-user-defined');
        has_typed_arrays = false;
    }
    req.send(null);
    if (req.status != 200 && req.status != 0) {
        throw "Error while loading " + file;
    }
    if (has_typed_arrays && 'mozResponse' in req) {
        response = req.mozResponse;
    } else if (has_typed_arrays && req.mozResponseArrayBuffer) {
        response = req.mozResponseArrayBuffer;
    } else if ('responseType' in req) {
        response = req.response;
    } else {
        response = req.responseText;
        has_typed_arrays = false;
    }
    if (has_typed_arrays) {
        size = response.byteLength;
        buff = new Uint8Array(response, 0, size);
        for (i = 0; i < size; i++) {
            this.write_8(addr + i, buff[i]);
        }
    } else {
        size = response.length;
        for (i = 0; i < size; i++) {
            this.write_8(addr + i, response.charCodeAt(i));
        }
    }
    return size;
};
